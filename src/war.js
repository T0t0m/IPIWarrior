const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 576;

const gravity = 0.7;
const groundY = 540;

let p1Choice = '../asset/character/fx.png';
let p2Choice = '../asset/character/kotlineur.png';
let bgChoice = '../asset/backgrounds/ipi.png';
const bgImage = new Image();
let gameActive = false;
let isLocalMode = false;
let currentMenuStep = 1;

const keys = {
    // P1
    KeyA: { pressed: false }, KeyD: { pressed: false }, KeyQ: { pressed: false },
    KeyW: { pressed: false }, KeyZ: { pressed: false }, KeyS: { pressed: false },
    KeyF: { pressed: false }, KeyG: { pressed: false }, KeyE: { pressed: false },
    // P2
    ArrowLeft: { pressed: false }, ArrowRight: { pressed: false },
    ArrowUp: { pressed: false }, ArrowDown: { pressed: false }
};

// --- NETWORKING LOGIC (WebRTC via PeerJS) ---
let peer = null;
let conn = null;
let isHost = false;

function startLocal() {
    isLocalMode = true;
    isHost = true;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('character-select').style.display = 'block';
    goToStep(1);
}

function showNetworkMenu() {
    isLocalMode = false;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('network-menu').style.display = 'flex';
}

function returnToMainMenu() {
    document.getElementById('network-menu').style.display = 'none';
    document.getElementById('character-select').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';

    if (conn) {
        conn.close();
        conn = null;
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
}

function hostGame() {
    isHost = true;
    peer = new Peer();
    document.getElementById('room-id-display').innerText = "Création du salon...";

    peer.on('open', (id) => {
        document.getElementById('room-id-display').innerText = id;
    });

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
        document.getElementById('network-menu').style.display = 'none';
        document.getElementById('character-select').style.display = 'block';
        goToStep(1);
    });
}

function joinGame() {
    isHost = false;
    const roomId = document.getElementById('join-id').value;
    if (!roomId) return;

    peer = new Peer();
    peer.on('open', () => {
        document.getElementById('join-status').innerText = "Connexion en cours...";
        conn = peer.connect(roomId);
        setupConnection();

        conn.on('open', () => {
            document.getElementById('network-menu').style.display = 'none';
            document.getElementById('character-select').style.display = 'block';
            goToStep(1);
        });
    });
}

function setupConnection() {
    conn.on('data', (data) => {
        if (data.type === 'setStep') {
            goToStep(data.step);
        } else if (data.type === 'charSelect') {
            selectChar(data.playerNum, data.imageSrc, data.elementId);
        } else if (data.type === 'bgSelect') {
            selectBg(data.imageSrc, data.elementId);
        } else if (data.type === 'startGame') {
            // Le client reçoit les choix définitifs (y compris ceux générés par "Aléatoire")
            p1Choice = data.p1;
            p2Choice = data.p2;
            bgChoice = data.bg;
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

// --- Menu de Sélection (Etapes) ---
function goToStep(step) {
    currentMenuStep = step;
    document.querySelectorAll('.step-container').forEach(el => el.style.display = 'none');
    document.getElementById('step-' + step).style.display = 'flex';

    if (step === 3 && !isHost && !isLocalMode) {
        document.getElementById('start-fight-btn').style.display = 'none';
        document.getElementById('waiting-host-msg').style.display = 'block';
    } else if (step === 3) {
        document.getElementById('start-fight-btn').style.display = 'block';
        document.getElementById('waiting-host-msg').style.display = 'none';
    }
}

function nextStep() {
    if (currentMenuStep < 3) {
        goToStep(currentMenuStep + 1);
        if (conn && !isLocalMode) conn.send({ type: 'setStep', step: currentMenuStep });
    }
}

function prevStep() {
    if (currentMenuStep > 1) {
        goToStep(currentMenuStep - 1);
        if (conn && !isLocalMode) conn.send({ type: 'setStep', step: currentMenuStep });
    }
}

function handleCharSelect(playerNum, imageSrc, elementId) {
    if (isLocalMode) {
        selectChar(playerNum, imageSrc, elementId);
    } else if ((isHost && playerNum === 1) || (!isHost && playerNum === 2)) {
        selectChar(playerNum, imageSrc, elementId);
        if (conn) conn.send({ type: 'charSelect', playerNum, imageSrc, elementId });
    }
}

function handleBgSelect(imageSrc, elementId) {
    if (isHost) {
        selectBg(imageSrc, elementId);
        if (conn) conn.send({ type: 'bgSelect', imageSrc, elementId });
    }
}

function handleStartGame() {
    if (isHost) {
        // Liste des chemins disponibles pour le tirage aléatoire
        const availableChars = [
            '../asset/character/fx.png',
            '../asset/character/kotlineur.png',
            '../asset/character/etienne.png',
            '../asset/character/benito.png',
            '../asset/character/uber.png'
        ];
        const availableStages = [
            '../asset/backgrounds/ipi.png',
            '../asset/backgrounds/ipi-china.png',
            '../asset/backgrounds/ipi-capitole.png',
            '../asset/backgrounds/ipi-garonne.png',
            '../asset/backgrounds/ipi-jungle.png',
            '../asset/backgrounds/ipi-street.png'
        ];

        // Résolution des choix aléatoires UNIQUEMENT par l'hôte pour éviter la désynchronisation
        if (p1Choice === 'random') {
            p1Choice = availableChars[Math.floor(Math.random() * availableChars.length)];
        }
        if (p2Choice === 'random') {
            p2Choice = availableChars[Math.floor(Math.random() * availableChars.length)];
        }
        if (bgChoice === 'random') {
            bgChoice = availableStages[Math.floor(Math.random() * availableStages.length)];
        }

        startGame();

        if (conn) {
            conn.send({
                type: 'startGame',
                p1: p1Choice,
                p2: p2Choice,
                bg: bgChoice
            });
        }
    }
}

function selectChar(playerNum, imageSrc, elementId) {
    if (playerNum === 1) {
        p1Choice = imageSrc;
        document.querySelectorAll('#step-1 .portrait').forEach(p => p.classList.remove('selected-p1'));
        document.getElementById(elementId).classList.add('selected-p1');
    } else {
        p2Choice = imageSrc;
        document.querySelectorAll('#step-2 .portrait').forEach(p => p.classList.remove('selected-p2'));
        document.getElementById(elementId).classList.add('selected-p2');
    }
}

function selectBg(imageSrc, elementId) {
    bgChoice = imageSrc;
    document.querySelectorAll('.bg-portrait').forEach(bg => bg.classList.remove('selected-bg'));
    document.getElementById(elementId).classList.add('selected-bg');
}

function formatCharacterName(filename) {
    if (filename === 'random') return '?';
    let rawName = filename.split('/').pop().replace('.png', '');
    if (rawName.toLowerCase() === 'fx') return 'FX';
    return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
}

// --- FIGHTER LOGIC ---
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
            ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('⚡ ÉTOURDI ⚡', centerX - 45, topY - 30);
        }
        ctx.restore();
    }

    update() {
        if (!isHost) {
            this.draw();
            return;
        }

        this.draw();

        if (this.perfectBlockWindow > 0) this.perfectBlockWindow--;
        if (this.stunTimer > 0) {
            this.stunTimer--;
            if (this.stunTimer <= 0) this.isStunned = false;
        }

        if (this.ultiPhraseTimer > 0) this.ultiPhraseTimer--;
        if (this.benitoHealTimer > 0) this.benitoHealTimer--;

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
        if (!isHost) return;
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

                let enemy = this === player1 ? player2 : player1;
                let dist = Math.abs((this.position.x + this.width / 2) - (enemy.position.x + enemy.width / 2));

                if (dist < 150 && !enemy.isKO) {
                    let pushDir = this.position.x < enemy.position.x ? 1 : -1;
                    enemy.position.x += 120 * pushDir;
                    if (enemy.position.x < 0) enemy.position.x = 0;
                    if (enemy.position.x + enemy.width > canvas.width) enemy.position.x = canvas.width - enemy.width;
                }
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

const player1 = new Fighter({ position: { x: 150, y: 0 }, velocity: { x: 0, y: 0 }, color: '#ff0000', side: 'left' });
const player2 = new Fighter({ position: { x: 800, y: 0 }, velocity: { x: 0, y: 0 }, color: '#0000ff', side: 'right' });

// Collisions & Combat
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
}

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

    msg.className = '';

    if (player1.health === player2.health) {
        msg.innerText = "ÉGALITÉ !";
        msg.classList.add('white-color');
    }
    else if (player1.health > player2.health) {
        msg.innerText = formatCharacterName(p1Choice) + " GAGNE !";
        msg.classList.add('p1-color');
    }
    else {
        msg.innerText = formatCharacterName(p2Choice) + " GAGNE !";
        msg.classList.add('p2-color');
    }

    display.style.display = 'flex';
    document.getElementById('restart-btn').style.display = isHost ? 'block' : 'none';
}

function resetAllKeys() {
    Object.keys(keys).forEach(k => { keys[k].pressed = false; });
    player1.isBlocking = false;
    player2.isBlocking = false;
}

function startGame() {
    player1.setHead(p1Choice); player2.setHead(p2Choice); bgImage.src = bgChoice;
    resetAllKeys();
    document.getElementById('p1-name').innerText = formatCharacterName(p1Choice);
    document.getElementById('p2-name').innerText = formatCharacterName(p2Choice);
    document.getElementById('character-select').style.display = 'none';

    document.getElementById('p1-ulti-text').style.display = 'none';
    document.getElementById('p2-ulti-text').style.display = 'none';

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
    if (isHost && !isLocalMode) conn.send({ type: 'restart' });
    gameActive = false;
    resetAllKeys();
    document.getElementById('display-text').style.display = 'none';
    document.getElementById('ui').style.display = 'none';
    document.getElementById('character-select').style.display = 'block';
    goToStep(1);
}

let animationId;
function animate() {
    if (!gameActive) {
        animationId = window.requestAnimationFrame(animate); return;
    }
    animationId = window.requestAnimationFrame(animate);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgImage.complete && bgImage.naturalHeight !== 0) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#1a1a24'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = '#111116'; ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, groundY, canvas.width, 4);

    player1.update(); player2.update();

    if (isHost) {
        if (!player1.isKO && !player2.isKO) {
            if (player1.position.x < player2.position.x) { player1.side = 'left'; player2.side = 'right'; }
            else { player1.side = 'right'; player2.side = 'left'; }
        }

        player1.isBlocking = keys.KeyS.pressed && player1.isGrounded;
        player2.isBlocking = keys.ArrowDown.pressed && player2.isGrounded;

        // P1 Move
        player1.velocity.x = 0;
        if (player1.isCharging) {
            player1.velocity.x = player1.side === 'left' ? 16 : -16;
            if (circleRectCollision(player1.attackBox, player2) && player2.isGrounded && !player2.isBlocking) {
                dealUltiDamage(player2, 35, player1.side === 'left' ? 45 : -40); player1.isCharging = false; player1.isAttacking = false;
            }
            if (player1.attackTimer <= 0) player1.isCharging = false;
        } else if (!player1.isStunned && !player1.isKO && !player1.isBlocking) {
            if (keys.KeyA.pressed || keys.KeyQ.pressed) player1.velocity.x = -6;
            else if (keys.KeyD.pressed) player1.velocity.x = 6;
        }

        // P2 Move
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

        // FX Ulti
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

        if (player1.characterName === 'uber' && player1.isAttacking && player1.attackType === 'ulti' && !player2.isGrounded) dealUltiDamage(player2, 0.4, 0);
        if (player2.characterName === 'uber' && player2.isAttacking && player2.attackType === 'ulti' && !player1.isGrounded) dealUltiDamage(player1, 0.4, 0);
        if (player1.characterName === 'kotlineur' && player1.isAttacking && player1.attackType === 'ulti' && (player2.position.x < 350 || (player2.position.x + player2.width) > 674)) dealUltiDamage(player2, 0.4, 0);
        if (player2.characterName === 'kotlineur' && player2.isAttacking && player2.attackType === 'ulti' && (player1.position.x < 350 || (player1.position.x + player1.width) > 674)) dealUltiDamage(player1, 0.4, 0);

        if (!isLocalMode && conn) {
            conn.send({
                type: 'gameState',
                state: { p1: serializePlayer(player1), p2: serializePlayer(player2), timer, gameOver }
            });
        }

        if ((player1.health <= 0 || player2.health <= 0) && !gameOver) {
            if (player1.health <= 0) player1.isKO = true; if (player2.health <= 0) player2.isKO = true;
            gameOver = true; setTimeout(determineWinner, 1500);
        }
    }

    // Effets visuels canvas des ultis
    [player1, player2].forEach(p => {
        if (p.fxClockActive) {
            ctx.fillStyle = '#222'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(canvas.width / 2, p.fxClockY, 75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.beginPath();
            ctx.moveTo(canvas.width / 2, p.fxClockY); ctx.lineTo(canvas.width / 2, p.fxClockY - 45);
            ctx.moveTo(canvas.width / 2, p.fxClockY); ctx.lineTo(canvas.width / 2 + 30, p.fxClockY + 15); ctx.stroke();
        }
        if (p.characterName === 'uber' && p.isAttacking && p.attackType === 'ulti') {
            ctx.fillStyle = '#00ff66'; ctx.font = 'bold 14px inherit'; ctx.textAlign = 'left';
            for (let i = 0; i < 5; i++) {
                ctx.fillText("ERREUR FATALE: WINDOWS DETECTÉ...", (Date.now() / 2 + i * 200) % canvas.width, 60 + i * 50);
                ctx.fillText("sudo rm -rf /mnt/c/Windows", (canvas.width - (Date.now() / 3 + i * 150) % canvas.width), 85 + i * 50);
            }
        }
        if (p.characterName === 'kotlineur' && p.isAttacking && p.attackType === 'ulti') {
            ctx.fillStyle = 'rgba(255, 0, 85, 0.18)'; ctx.fillRect(0, 0, 350, groundY); ctx.fillRect(674, 0, canvas.width - 674, groundY);
            ctx.fillStyle = '#ff0000'; ctx.font = 'bold 18px inherit'; ctx.textAlign = 'center';
            ctx.fillText("⚠️ COIN EN FLAMMES ⚠️", 175, 80); ctx.fillText("⚠️ COIN EN FLAMMES ⚠️", 849, 80);
        }
        if (p.benitoHealTimer > 0) {
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)'; ctx.lineWidth = 4; ctx.beginPath();
            ctx.arc(p.position.x + p.width / 2, p.position.y + p.height / 2, 70, 0, Math.PI * 2); ctx.stroke();
        }
    });

    // Affichage des phrases d'ultime via le DOM
    const p1UltiDiv = document.getElementById('p1-ulti-text');
    if (player1.ultiPhraseTimer > 0) {
        p1UltiDiv.innerText = formatCharacterName(p1Choice) + " : \"" + player1.ultiPhrase + "\"";
        p1UltiDiv.style.display = 'flex';
    } else {
        p1UltiDiv.style.display = 'none';
    }

    const p2UltiDiv = document.getElementById('p2-ulti-text');
    if (player2.ultiPhraseTimer > 0) {
        p2UltiDiv.innerText = formatCharacterName(p2Choice) + " : \"" + player2.ultiPhrase + "\"";
        p2UltiDiv.style.display = 'flex';
    } else {
        p2UltiDiv.style.display = 'none';
    }

    document.getElementById('p1-ulti').style.width = player1.ultimateCharge + '%';
    document.getElementById('p2-ulti').style.width = player2.ultimateCharge + '%';
}

window.addEventListener('blur', () => {
    resetAllKeys();
});

const clientToHostMap = {
    'KeyD': 'ArrowRight',
    'KeyA': 'ArrowLeft', 'KeyQ': 'ArrowLeft',
    'KeyW': 'ArrowUp', 'KeyZ': 'ArrowUp',
    'KeyS': 'ArrowDown',
    'KeyF': 'ShiftRight',
    'KeyG': 'ControlRight',
    'KeyE': 'Enter'
};

window.addEventListener('keydown', (e) => {
    if (gameOver || !gameActive) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }

    if (isLocalMode) {
        handleInput(e.key, e.code, true);
    } else {
        if (isHost) {
            const p1Codes = ['KeyA', 'KeyD', 'KeyQ', 'KeyW', 'KeyZ', 'KeyS', 'KeyF', 'KeyG', 'KeyE'];
            if (p1Codes.includes(e.code)) handleInput(e.key, e.code, true);
        } else if (conn) {
            if (clientToHostMap[e.code]) {
                const translatedCode = clientToHostMap[e.code];
                conn.send({ type: 'keydown', key: e.key, code: translatedCode });
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (isLocalMode) {
        handleInput(e.key, e.code, false);
    } else {
        if (isHost) {
            const p1Codes = ['KeyA', 'KeyD', 'KeyQ', 'KeyW', 'KeyZ', 'KeyS', 'KeyF', 'KeyG', 'KeyE'];
            if (p1Codes.includes(e.code)) handleInput(e.key, e.code, false);
        } else if (conn) {
            if (clientToHostMap[e.code]) {
                const translatedCode = clientToHostMap[e.code];
                conn.send({ type: 'keyup', key: e.key, code: translatedCode });
            }
        }
    }
});

function handleInput(keyString, codeString, isKeyDown) {
    const p1Codes = ['KeyA', 'KeyD', 'KeyQ', 'KeyW', 'KeyZ', 'KeyS', 'KeyF', 'KeyG', 'KeyE'];
    if (p1Codes.includes(codeString)) {
        const canP1Act = !player1.isStunned && !player1.isKO;
        if (isKeyDown && canP1Act) {
            if (codeString === 'KeyD' && !player1.isBlocking) keys.KeyD.pressed = true;
            if ((codeString === 'KeyA' || codeString === 'KeyQ') && !player1.isBlocking) keys.KeyA.pressed = true;
            if ((codeString === 'KeyW' || codeString === 'KeyZ') && player1.isGrounded && !player1.isBlocking) player1.velocity.y = -18;
            if (codeString === 'KeyS' && player1.isGrounded && !player1.isAttacking) {
                keys.KeyS.pressed = true;
                if (!player1.isBlocking) { player1.isBlocking = true; player1.perfectBlockWindow = 10; }
            }
            if (codeString === 'KeyF') player1.attack('punch');
            if (codeString === 'KeyG') player1.attack('kick');
            if (codeString === 'KeyE') player1.attack('ulti');
        } else if (!isKeyDown) {
            if (codeString === 'KeyD') keys.KeyD.pressed = false;
            if (codeString === 'KeyA' || codeString === 'KeyQ') keys.KeyA.pressed = false;
            if (codeString === 'KeyS') { keys.KeyS.pressed = false; player1.isBlocking = false; }
        }
    }

    const p2Codes = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ShiftRight', 'ControlRight', 'Enter', 'NumpadEnter'];
    if (p2Codes.includes(codeString)) {
        const canP2Act = !player2.isStunned && !player2.isKO;
        if (isKeyDown && canP2Act) {
            if (codeString === 'ArrowRight' && !player2.isBlocking) keys.ArrowRight.pressed = true;
            if (codeString === 'ArrowLeft' && !player2.isBlocking) keys.ArrowLeft.pressed = true;
            if (codeString === 'ArrowUp' && player2.isGrounded && !player2.isBlocking) player2.velocity.y = -18;
            if (codeString === 'ArrowDown' && player2.isGrounded && !player2.isAttacking) {
                keys.ArrowDown.pressed = true;
                if (!player2.isBlocking) { player2.isBlocking = true; player2.perfectBlockWindow = 10; }
            }
            if (codeString === 'ShiftRight') player2.attack('punch');
            if (codeString === 'ControlRight') player2.attack('kick');
            if (codeString === 'Enter' || codeString === 'NumpadEnter') player2.attack('ulti');
        } else if (!isKeyDown) {
            if (codeString === 'ArrowRight') keys.ArrowRight.pressed = false;
            if (codeString === 'ArrowLeft') keys.ArrowLeft.pressed = false;
            if (codeString === 'ArrowDown') { keys.ArrowDown.pressed = false; player2.isBlocking = false; }
        }
    }
}