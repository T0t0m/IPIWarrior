const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 576;

const gravity = 0.7;
const groundY = 480;

let p1Choice = '../asset/character/fx.png';
let p2Choice = '../asset/character/kotlineur.png';
let bgChoice = '../asset/backgrounds/ipi.png';
const bgImage = new Image();
let gameActive = false;

const keys = {
    a: { pressed: false }, d: { pressed: false }, w: { pressed: false }, s: { pressed: false },
    ArrowLeft: { pressed: false }, ArrowRight: { pressed: false }, ArrowUp: { pressed: false }, ArrowDown: { pressed: false }
};

// --- NETWORKING LOGIC (WebRTC via PeerJS) ---
let peer = null;
let conn = null;
let isHost = false;

function hostGame() {
    isHost = true;
    peer = new Peer(); // Auto-generate ID
    document.getElementById('room-id-display').innerText = "Connecting to server...";

    peer.on('open', (id) => {
        document.getElementById('room-id-display').innerText = id;
    });

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
        // Hide network menu, show character select
        document.getElementById('network-menu').style.display = 'none';
        document.getElementById('character-select').style.display = 'flex';
        document.getElementById('start-fight-btn').style.display = 'block'; // Host can start
    });
}

function joinGame() {
    isHost = false;
    const roomId = document.getElementById('join-id').value;
    if (!roomId) return;

    peer = new Peer();
    peer.on('open', () => {
        document.getElementById('join-status').innerText = "Connecting...";
        conn = peer.connect(roomId);
        setupConnection();

        conn.on('open', () => {
            document.getElementById('network-menu').style.display = 'none';
            document.getElementById('character-select').style.display = 'flex';
            document.getElementById('waiting-host-msg').style.display = 'block'; // Client waits
        });
    });
}

function setupConnection() {
    conn.on('data', (data) => {
        if (data.type === 'charSelect') {
            selectChar(data.playerNum, data.imageSrc, data.elementId);
        } else if (data.type === 'bgSelect') {
            selectBg(data.imageSrc, data.elementId);
        } else if (data.type === 'startGame') {
            startGame();
        } else if (data.type === 'keydown' && isHost) {
            handleInput(data.key, data.code, true);
        } else if (data.type === 'keyup' && isHost) {
            handleInput(data.key, data.code, false);
        } else if (data.type === 'gameState' && !isHost) {
            syncGameState(data.state);
        } else if (data.type === 'restart') {
            returnToMenu();
        }
    });
}

// Intercept UI clicks to send over network
function handleCharSelect(playerNum, imageSrc, elementId) {
    if ((isHost && playerNum === 1) || (!isHost && playerNum === 2)) {
        selectChar(playerNum, imageSrc, elementId);
        conn.send({ type: 'charSelect', playerNum, imageSrc, elementId });
    }
}

function handleBgSelect(imageSrc, elementId) {
    if (isHost) { // Only host selects stage
        selectBg(imageSrc, elementId);
        conn.send({ type: 'bgSelect', imageSrc, elementId });
    }
}

function handleStartGame() {
    if (isHost) {
        startGame();
        conn.send({ type: 'startGame' });
    }
}

// Standard UI functions
function selectChar(playerNum, imageSrc, elementId) {
    if (playerNum === 1) {
        p1Choice = imageSrc;
        document.querySelectorAll('#p1-selection .portrait').forEach(p => p.classList.remove('selected-p1'));
        document.getElementById(elementId).classList.add('selected-p1');
    } else {
        p2Choice = imageSrc;
        document.querySelectorAll('#p2-selection .portrait').forEach(p => p.classList.remove('selected-p2'));
        document.getElementById(elementId).classList.add('selected-p2');
    }
}

function selectBg(imageSrc, elementId) {
    bgChoice = imageSrc;
    document.querySelectorAll('.stage-select .bg-portrait').forEach(bg => bg.classList.remove('selected-bg'));
    document.getElementById(elementId).classList.add('selected-bg');
}

function formatCharacterName(filename) {
    let rawName = filename.split('/').pop().replace('.png', '');
    if (rawName.toLowerCase() === 'fx') return 'FX';
    return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
}

// --- FIGHTER LOGIC (Unchanged, calculates on Host only) ---
class Fighter {
    constructor({ position, velocity, color, side }) {
        this.position = position;
        this.velocity = velocity;
        this.width = 60;
        this.height = 130;
        this.color = color;
        this.health = 100;
        this.side = side;
        this.isGrounded = false;
        this.isAttacking = false;
        this.isBlocking = false;
        this.attackType = null;
        this.attackTimer = 0;
        this.cooldown = 0;
        this.headImage = new Image();

        this.perfectBlockWindow = 0;
        this.isStunned = false;
        this.stunTimer = 0;
        this.isKO = false;

        this.ultimateCharge = 0;
        this.characterName = '';
        this.ultiPhrase = '';
        this.ultiPhraseTimer = 0;

        this.fxClockActive = false;
        this.fxClockY = 0;
        this.fxClockHit = false;
        this.isCharging = false;
        this.benitoHealTimer = 0;

        this.attackBox = {
            position: { x: this.position.x, y: this.position.y },
            radius: 25
        };
    }

    setHead(imageSrc) {
        this.headImage.src = imageSrc;
        this.characterName = imageSrc.split('/').pop().replace('.png', '').toLowerCase();
    }

    draw() {
        const dir = this.side === 'left' ? 1 : -1;
        const centerX = this.position.x + this.width / 2;
        const topY = this.position.y;

        const shadowWidth = this.isGrounded ? 50 : 30 + (this.position.y / groundY) * 20;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(centerX, groundY + 5, shadowWidth, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();

        if (this.isKO) {
            ctx.translate(centerX, topY + 130);
            ctx.rotate(this.side === 'left' ? -Math.PI / 2 : Math.PI / 2);
            ctx.translate(-centerX, -(topY + 130));
        }

        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.isStunned && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.strokeStyle = '#ffcc00';
            ctx.fillStyle = '#ffcc00';
        }

        if (this.headImage.complete && this.headImage.naturalHeight !== 0) {
            ctx.drawImage(this.headImage, centerX - 30, topY - 15, 60, 60);
        } else {
            ctx.beginPath();
            ctx.arc(centerX, topY + 20, 18, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.beginPath();
        ctx.moveTo(centerX, topY + 45);
        ctx.lineTo(centerX, topY + 85);
        ctx.stroke();

        ctx.beginPath();
        if (this.isKO) {
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX - 10, topY + 130);
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX + 10, topY + 130);
        } else if (this.isAttacking && this.attackType === 'kick') {
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX - (20 * dir), topY + 130);
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX + (55 * dir), topY + 95);
        } else {
            let legOffset = this.velocity.x !== 0 ? Math.sin(Date.now() / 100) * 15 : 15;
            if (!this.isGrounded) legOffset = 5;
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX - legOffset, topY + 130);
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX + legOffset, topY + 130);
        }
        ctx.stroke();

        ctx.beginPath();
        if (this.isKO) {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX - 20, topY + 40);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + 20, topY + 40);
        } else if (this.isAttacking && this.attackType === 'punch') {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX - (20 * dir), topY + 75);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (50 * dir), topY + 50);
        } else if (this.isAttacking && this.attackType === 'ulti' && this.characterName === 'etienne') {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (50 * dir), topY + 20);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (50 * dir), topY + 80);
        } else if (this.isBlocking) {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (15 * dir), topY + 25);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (25 * dir), topY + 50);
        } else {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX - 15, topY + 80);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + 15, topY + 80);
        }
        ctx.stroke();

        if (this.isAttacking) {
            if (this.attackType === 'punch') {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath(); ctx.arc(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.radius, 0, Math.PI * 2); ctx.fill();
            } else if (this.attackType === 'kick') {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
                ctx.beginPath(); ctx.arc(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.radius, 0, Math.PI * 2); ctx.fill();
            } else if (this.attackType === 'ulti' && this.characterName === 'etienne') {
                ctx.fillStyle = 'rgba(255, 50, 0, 0.4)';
                ctx.beginPath(); ctx.arc(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.radius, 0, Math.PI * 2); ctx.fill();
            }
        }

        if (this.isBlocking && !this.isKO) {
            ctx.lineWidth = 4;
            if (this.perfectBlockWindow > 0) {
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
                ctx.beginPath(); ctx.arc(centerX + (25 * dir), topY + 55, 35, -Math.PI / 2, Math.PI / 2, dir < 0); ctx.stroke();
            } else {
                ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
                ctx.beginPath(); ctx.arc(centerX + (22 * dir), topY + 55, 28, -Math.PI / 2, Math.PI / 2, dir < 0); ctx.stroke();
            }
        }

        if (this.isStunned && !this.isKO) {
            ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('⚡ STUNNED ⚡', centerX - 45, topY - 30);
        }
        ctx.restore();
    }

    update() {
        if (!isHost) {
            this.draw(); // Clients only draw based on received state
            return;
        }

        this.draw();

        if (this.perfectBlockWindow > 0) this.perfectBlockWindow--;
        if (this.stunTimer > 0) {
            this.stunTimer--;
            if (this.stunTimer <= 0) this.isStunned = false;
        }

        if (this.attackType === 'punch') {
            this.attackBox.radius = 25; this.attackBox.position.y = this.position.y + 50;
        } else if (this.attackType === 'kick') {
            this.attackBox.radius = 35; this.attackBox.position.y = this.position.y + 110;
        } else if (this.characterName === 'etienne' && this.attackType === 'ulti') {
            this.attackBox.radius = 45; this.attackBox.position.y = this.position.y + 65;
        }

        if (this.side === 'left') {
            this.attackBox.position.x = this.position.x + this.width + 10;
        } else {
            this.attackBox.position.x = this.position.x - 10;
        }

        if (this.ultimateCharge < 100 && !this.isKO) {
            this.ultimateCharge += (100 / 3600);
            if (this.ultimateCharge > 100) this.ultimateCharge = 100;
        }

        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        if (this.position.y + this.height + this.velocity.y >= groundY) {
            this.velocity.y = 0;
            this.position.y = groundY - this.height;
            this.isGrounded = true;
        } else {
            this.velocity.y += gravity;
            this.isGrounded = false;
        }

        if (this.position.x < 0) this.position.x = 0;
        if (this.position.x + this.width > canvas.width) this.position.x = canvas.width - this.width;

        if (this.cooldown > 0) this.cooldown--;

        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.attackType = null;
            }
        }
    }

    attack(type) {
        if (!isHost) return; // Only host handles attacks
        if (this.isAttacking || this.isStunned || this.isKO || this.isBlocking || this.cooldown > 0) return;

        if (type === 'ulti') {
            if (this.ultimateCharge < 100) return;
            this.ultimateCharge = 0; this.cooldown = 150; this.ultiPhraseTimer = 90;
            this.isAttacking = true; this.attackType = 'ulti';

            if (this.characterName === 'fx') {
                this.ultiPhrase = "METTEZ VOS HEURES !"; this.attackTimer = 110;
                this.fxClockActive = true; this.fxClockY = -150; this.fxClockHit = false;
            } else if (this.characterName === 'etienne') {
                this.ultiPhrase = "LE DIRECTEUR C'EST MOI !"; this.attackTimer = 40; this.isCharging = true;
            } else if (this.characterName === 'uber') {
                this.ultiPhrase = "WINDOWS C'EST DE LA MERDE !"; this.attackTimer = 120;
            } else if (this.characterName === 'kotlineur') {
                this.ultiPhrase = "LA SALLE !"; this.attackTimer = 120;
            } else if (this.characterName === 'benito') {
                this.ultiPhrase = "J'AI RIEN À PROUVER !"; this.attackTimer = 40;
                this.health = Math.min(100, this.health + 50); this.benitoHealTimer = 40;
                updateHealthUI();
            }
            return;
        } else if (type === 'punch') {
            this.attackTimer = 10; this.cooldown = 20;
        } else if (type === 'kick') {
            this.attackTimer = 25; this.cooldown = 50;
        }

        this.isAttacking = true; this.attackType = type;
        checkHit(this, this === player1 ? player2 : player1);
    }
}

const player1 = new Fighter({ position: { x: 150, y: 0 }, velocity: { x: 0, y: 0 }, color: '#ff0055', side: 'left' });
const player2 = new Fighter({ position: { x: 800, y: 0 }, velocity: { x: 0, y: 0 }, color: '#00d2ff', side: 'right' });

// Collisions & Combat Logic (Host only)
function circleRectCollision(circle, rect) {
    let testX = circle.position.x; let testY = circle.position.y;
    if (circle.position.x < rect.position.x) testX = rect.position.x;
    else if (circle.position.x > rect.position.x + rect.width) testX = rect.position.x + rect.width;
    if (circle.position.y < rect.position.y) testY = rect.position.y;
    else if (circle.position.y > rect.position.y + rect.height) testY = rect.position.y + rect.height;

    const distX = circle.position.x - testX; const distY = circle.position.y - testY;
    const distance = Math.sqrt((distX * distX) + (distY * distY));
    return distance <= circle.radius;
}

function dealUltiDamage(defender, amount, knockback) {
    if (defender.isKO) return;
    defender.health -= amount; if (defender.health < 0) defender.health = 0;
    defender.position.x += knockback;
    updateHealthUI();
}

function checkHit(attacker, defender) {
    if (!circleRectCollision(attacker.attackBox, defender)) return;

    if (defender.isBlocking && !defender.isKO) {
        if (defender.perfectBlockWindow > 0) {
            defender.ultimateCharge = Math.min(100, defender.ultimateCharge + 2);
            attacker.isStunned = true; attacker.stunTimer = 120;
            attacker.velocity.x = 0; attacker.isAttacking = false;
            return;
        } else {
            defender.ultimateCharge = Math.min(100, defender.ultimateCharge + 0.5);
            let blockDamage = attacker.attackType === 'punch' ? 1 : 2;
            defender.health -= blockDamage; if (defender.health < 0) defender.health = 0;
            updateHealthUI(); return;
        }
    }

    if (attacker.attackType === 'punch') attacker.ultimateCharge = Math.min(100, attacker.ultimateCharge + 1);
    else if (attacker.attackType === 'kick') attacker.ultimateCharge = Math.min(100, attacker.ultimateCharge + 5);

    let damage = attacker.attackType === 'punch' ? 7 : 12;
    let knockbackDirection = attacker.side === 'left' ? 15 : -15;

    defender.health -= damage; if (defender.health < 0) defender.health = 0;
    defender.position.x += knockbackDirection;
    updateHealthUI();
}

function updateHealthUI() {
    document.getElementById('p1-health').style.width = player1.health + '%';
    document.getElementById('p2-health').style.width = player2.health + '%';
    document.getElementById('p1-ulti').style.width = player1.ultimateCharge + '%';
    document.getElementById('p2-ulti').style.width = player2.ultimateCharge + '%';
}

// Game State Syncing (Host -> Client)
function serializePlayer(p) {
    return {
        x: p.position.x, y: p.position.y, health: p.health, side: p.side,
        isGrounded: p.isGrounded, isAttacking: p.isAttacking, isBlocking: p.isBlocking,
        attackType: p.attackType, isStunned: p.isStunned, isKO: p.isKO,
        ultCharge: p.ultimateCharge, fxActive: p.fxClockActive, fxY: p.fxClockY,
        ultiPhrase: p.ultiPhrase, ultiTimer: p.ultiPhraseTimer, healTimer: p.benitoHealTimer,
        vx: p.velocity.x
    };
}

function syncGameState(state) {
    // Client applies Host's exact state
    const applyState = (p, data) => {
        p.position.x = data.x; p.position.y = data.y; p.health = data.health; p.side = data.side;
        p.isGrounded = data.isGrounded; p.isAttacking = data.isAttacking; p.isBlocking = data.isBlocking;
        p.attackType = data.attackType; p.isStunned = data.isStunned; p.isKO = data.isKO;
        p.ultimateCharge = data.ultCharge; p.fxClockActive = data.fxActive; p.fxClockY = data.fxY;
        p.ultiPhrase = data.ultiPhrase; p.ultiPhraseTimer = data.ultiTimer; p.benitoHealTimer = data.healTimer;
        p.velocity.x = data.vx;
    };
    applyState(player1, state.p1);
    applyState(player2, state.p2);

    timer = state.timer;
    document.getElementById('timer').innerText = timer;

    if (state.gameOver && !gameOver) determineWinner();
    updateHealthUI();
}

let timer = 99; let timerId; let gameOver = false;

function decreaseTimer() {
    if (isHost && timer > 0 && !gameOver && gameActive) {
        timerId = setTimeout(decreaseTimer, 1000);
        timer--;
        document.getElementById('timer').innerText = timer;
    }
    if (timer === 0 && isHost) determineWinner();
}

function determineWinner() {
    clearTimeout(timerId); gameOver = true;
    const display = document.getElementById('display-text');
    const msg = document.getElementById('win-message');
    display.style.display = 'flex';

    if (player1.health === player2.health) msg.innerText = "DRAW GAME";
    else if (player1.health > player2.health) msg.innerText = formatCharacterName(p1Choice) + " WINS!";
    else msg.innerText = formatCharacterName(p2Choice) + " WINS!";

    // Client restart button is hidden, only Host controls flow
    document.getElementById('restart-btn').style.display = isHost ? 'block' : 'none';
}

function startGame() {
    player1.setHead(p1Choice); player2.setHead(p2Choice); bgImage.src = bgChoice;
    document.getElementById('p1-name').innerText = formatCharacterName(p1Choice);
    document.getElementById('p2-name').innerText = formatCharacterName(p2Choice);
    document.getElementById('character-select').style.display = 'none';
    document.getElementById('ui').style.display = 'flex';

    player1.health = 100; player1.position = { x: 150, y: 0 }; player1.isKO = false;
    player1.isStunned = false; player1.isBlocking = false; player1.isAttacking = false; player1.cooldown = 0; player1.ultimateCharge = 0; player1.fxClockActive = false; player1.isCharging = false; player1.benitoHealTimer = 0; player1.ultiPhraseTimer = 0;

    player2.health = 100; player2.position = { x: 800, y: 0 }; player2.isKO = false;
    player2.isStunned = false; player2.isBlocking = false; player2.isAttacking = false; player2.cooldown = 0; player2.ultimateCharge = 0; player2.fxClockActive = false; player2.isCharging = false; player2.benitoHealTimer = 0; player2.ultiPhraseTimer = 0;

    updateHealthUI(); timer = 99; document.getElementById('timer').innerText = timer;
    document.getElementById('display-text').style.display = 'none';

    gameOver = false; gameActive = true; clearTimeout(timerId); decreaseTimer();
    if (!animationId) animate();
}

function returnToMenu() {
    if (isHost) conn.send({ type: 'restart' });
    gameActive = false;
    document.getElementById('display-text').style.display = 'none';
    document.getElementById('ui').style.display = 'none';
    document.getElementById('character-select').style.display = 'flex';
}

let animationId;
function animate() {
    if (!gameActive) {
        animationId = window.requestAnimationFrame(animate); return;
    }
    animationId = window.requestAnimationFrame(animate);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgImage.complete && bgImage.naturalHeight !== 0) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    else { ctx.fillStyle = '#1a1a24'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    ctx.fillStyle = '#111116'; ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, groundY, canvas.width, 2);

    player1.update(); player2.update();

    // --- HOST PHYSICS LOGIC ---
    if (isHost) {
        if (!player1.isKO && !player2.isKO) {
            if (player1.position.x < player2.position.x) { player1.side = 'left'; player2.side = 'right'; }
            else { player1.side = 'right'; player2.side = 'left'; }
        }

        player1.isBlocking = keys.s.pressed && player1.isGrounded;
        player2.isBlocking = keys.ArrowDown.pressed && player2.isGrounded;

        // Move P1
        player1.velocity.x = 0;
        if (player1.isCharging) {
            player1.velocity.x = player1.side === 'left' ? 16 : -16;
            if (circleRectCollision(player1.attackBox, player2) && player2.isGrounded && !player2.isBlocking) {
                dealUltiDamage(player2, 35, player1.side === 'left' ? 45 : -40); player1.isCharging = false; player1.isAttacking = false;
            }
            if (player1.attackTimer <= 0) player1.isCharging = false;
        } else if (!player1.isStunned && !player1.isKO && !player1.isBlocking) {
            if (keys.a.pressed) player1.velocity.x = -6; else if (keys.d.pressed) player1.velocity.x = 6;
        }

        // Move P2
        player2.velocity.x = 0;
        if (player2.isCharging) {
            player2.velocity.x = player2.side === 'left' ? 16 : -16;
            if (circleRectCollision(player2.attackBox, player1) && player1.isGrounded && !player1.isBlocking) {
                dealUltiDamage(player1, 35, player2.side === 'left' ? 45 : -40); player2.isCharging = false; player2.isAttacking = false;
            }
            if (player2.attackTimer <= 0) player2.isCharging = false;
        } else if (!player2.isStunned && !player2.isKO && !player2.isBlocking) {
            if (keys.ArrowLeft.pressed) player2.velocity.x = -6; else if (keys.ArrowRight.pressed) player2.velocity.x = 6;
        }

        // --- HOST FX LOGIC ---
        [player1, player2].forEach(p => {
            let enemy = p === player1 ? player2 : player1;
            if (p.fxClockActive) {
                p.fxClockY += 14;
                if (p.fxClockY >= groundY - 60 && !p.fxClockHit) {
                    p.fxClockHit = true;
                    if (enemy.position.x + enemy.width >= 412 && enemy.position.x <= 612 && !enemy.isBlocking) {
                        dealUltiDamage(enemy, 35, p.side === 'left' ? 30 : -30);
                    }
                }
                if (p.fxClockY > canvas.height + 100) p.fxClockActive = false;
            }
        });

        // --- UBER & KOTLINEUR PASSIVE ULTI DAMAGE ---
        if (player1.characterName === 'uber' && player1.isAttacking && player1.attackType === 'ulti' && !player2.isGrounded) dealUltiDamage(player2, 0.4, 0);
        if (player2.characterName === 'uber' && player2.isAttacking && player2.attackType === 'ulti' && !player1.isGrounded) dealUltiDamage(player1, 0.4, 0);
        if (player1.characterName === 'kotlineur' && player1.isAttacking && player1.attackType === 'ulti' && (player2.position.x < 350 || (player2.position.x + player2.width) > 674)) dealUltiDamage(player2, 0.4, 0);
        if (player2.characterName === 'kotlineur' && player2.isAttacking && player2.attackType === 'ulti' && (player1.position.x < 350 || (player1.position.x + player1.width) > 674)) dealUltiDamage(player1, 0.4, 0);

        // Host ends tick by broadcasting state
        conn.send({
            type: 'gameState',
            state: { p1: serializePlayer(player1), p2: serializePlayer(player2), timer, gameOver }
        });

        if ((player1.health <= 0 || player2.health <= 0) && !gameOver) {
            if (player1.health <= 0) player1.isKO = true; if (player2.health <= 0) player2.isKO = true;
            gameOver = true; setTimeout(determineWinner, 1500);
        }
    }

    // --- VISUAL DRAWING (Both Host & Client) ---
    [player1, player2].forEach(p => {
        if (p.fxClockActive) {
            ctx.fillStyle = '#222'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(canvas.width / 2, p.fxClockY, 75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.beginPath();
            ctx.moveTo(canvas.width / 2, p.fxClockY); ctx.lineTo(canvas.width / 2, p.fxClockY - 45);
            ctx.moveTo(canvas.width / 2, p.fxClockY); ctx.lineTo(canvas.width / 2 + 30, p.fxClockY + 15); ctx.stroke();
        }
        if (p.characterName === 'uber' && p.isAttacking && p.attackType === 'ulti') {
            ctx.fillStyle = '#00ff66'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
            for (let i = 0; i < 5; i++) {
                ctx.fillText("FATAL ERROR: WINDOWS DETECTED. PURGING BASE...", (Date.now() / 2 + i * 200) % canvas.width, 60 + i * 50);
                ctx.fillText("sudo rm -rf /mnt/c/Windows/System32", (canvas.width - (Date.now() / 3 + i * 150) % canvas.width), 85 + i * 50);
            }
        }
        if (p.characterName === 'kotlineur' && p.isAttacking && p.attackType === 'ulti') {
            ctx.fillStyle = 'rgba(255, 0, 85, 0.18)'; ctx.fillRect(0, 0, 350, groundY); ctx.fillRect(674, 0, canvas.width - 674, groundY);
            ctx.fillStyle = '#ff0055'; ctx.font = 'bold 18px Courier New'; ctx.textAlign = 'center';
            ctx.fillText("⚠️ COIN EN FLAMMES ⚠️", 175, 80); ctx.fillText("⚠️ COIN EN FLAMMES ⚠️", 849, 80);
        }
        if (p.benitoHealTimer > 0) {
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)'; ctx.lineWidth = 4; ctx.beginPath();
            ctx.arc(p.position.x + p.width / 2, p.position.y + p.height / 2, 70, 0, Math.PI * 2); ctx.stroke();
        }
    });

    ctx.save();
    if (player1.ultiPhraseTimer > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; ctx.fillRect(0, 160, canvas.width, 55);
        ctx.fillStyle = player1.color; ctx.font = 'bold 22px Courier New'; ctx.textAlign = 'center';
        ctx.fillText(formatCharacterName(p1Choice) + " : \"" + player1.ultiPhrase + "\"", canvas.width / 2, 195);
    }
    if (player2.ultiPhraseTimer > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; ctx.fillRect(0, 240, canvas.width, 55);
        ctx.fillStyle = player2.color; ctx.font = 'bold 22px Courier New'; ctx.textAlign = 'center';
        ctx.fillText(formatCharacterName(p2Choice) + " : \"" + player2.ultiPhrase + "\"", canvas.width / 2, 275);
    }
    ctx.restore();
}

// Input handling router
window.addEventListener('keydown', (e) => {
    if (gameOver || !gameActive || !conn) return;
    if (isHost) handleInput(e.key, e.code, true);
    else conn.send({ type: 'keydown', key: e.key, code: e.code });
});

window.addEventListener('keyup', (e) => {
    if (!conn) return;
    if (isHost) handleInput(e.key, e.code, false);
    else conn.send({ type: 'keyup', key: e.key, code: e.code });
});

// Centralized input processing (Host Only)
function handleInput(keyString, codeString, isKeyDown) {
    const key = keyString.toLowerCase();

    // Player 1 controls (Host Local)
    if (key === 'd' || key === 'a' || key === 'q' || key === 'w' || key === 'z' || key === 's' || key === 'f' || key === 'g' || key === 'e') {
        const canP1Act = !player1.isStunned && !player1.isKO;
        if (isKeyDown && canP1Act) {
            if (key === 'd' && !player1.isBlocking) keys.d.pressed = true;
            if ((key === 'a' || key === 'q') && !player1.isBlocking) keys.a.pressed = true;
            if ((key === 'w' || key === 'z') && player1.isGrounded && !player1.isBlocking) player1.velocity.y = -18;
            if (key === 's' && player1.isGrounded && !player1.isAttacking) { keys.s.pressed = true; if (!player1.isBlocking) { player1.isBlocking = true; player1.perfectBlockWindow = 10; } }
            if (key === 'f') player1.attack('punch');
            if (key === 'g') player1.attack('kick');
            if (key === 'e') player1.attack('ulti');
        } else if (!isKeyDown) {
            if (key === 'd') keys.d.pressed = false;
            if (key === 'a' || key === 'q') keys.a.pressed = false;
            if (key === 's') { keys.s.pressed = false; player1.isBlocking = false; }
        }
    }

    // Player 2 controls (Received from Client)
    if (key === 'arrowright' || key === 'arrowleft' || key === 'arrowup' || key === 'arrowdown' || key === 'enter' || codeString === 'ShiftRight' || codeString === 'ControlRight') {
        const canP2Act = !player2.isStunned && !player2.isKO;
        if (isKeyDown && canP2Act) {
            if (key === 'arrowright' && !player2.isBlocking) keys.ArrowRight.pressed = true;
            if (key === 'arrowleft' && !player2.isBlocking) keys.ArrowLeft.pressed = true;
            if (key === 'arrowup' && player2.isGrounded && !player2.isBlocking) player2.velocity.y = -18;
            if (key === 'arrowdown' && player2.isGrounded && !player2.isAttacking) { keys.ArrowDown.pressed = true; if (!player2.isBlocking) { player2.isBlocking = true; player2.perfectBlockWindow = 10; } }
            if (codeString === 'ShiftRight') player2.attack('punch');
            if (codeString === 'ControlRight') player2.attack('kick');
            if (key === 'enter') player2.attack('ulti');
        } else if (!isKeyDown) {
            if (key === 'arrowright') keys.ArrowRight.pressed = false;
            if (key === 'arrowleft') keys.ArrowLeft.pressed = false;
            if (key === 'arrowdown') { keys.ArrowDown.pressed = false; player2.isBlocking = false; }
        }
    }
}