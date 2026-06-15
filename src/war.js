const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1024;
canvas.height = 576;

const gravity = 0.7;
const groundY = 480;

// Default Selections
let p1Choice = '../asset/character/fx.png';
let p2Choice = '../asset/character/kotlineur.png';
let gameActive = false;

// Track key states
const keys = {
    a: { pressed: false }, d: { pressed: false }, w: { pressed: false }, s: { pressed: false },
    ArrowLeft: { pressed: false }, ArrowRight: { pressed: false }, ArrowUp: { pressed: false }, ArrowDown: { pressed: false }
};

// Formater le nom du personnage (CORRIGÉ)
function formatCharacterName(filename) {
    let rawName = filename.split('/').pop().replace('.png', '');
    if (rawName.toLowerCase() === 'fx') return 'FX';
    return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
}

// UI Menu Logic
function selectChar(playerNum, imageSrc, elementId) {
    if (playerNum === 1) {
        p1Choice = imageSrc;
        const portraits = document.querySelectorAll('#p1-selection .portrait');
        portraits.forEach(p => p.classList.remove('selected-p1'));
        document.getElementById(elementId).classList.add('selected-p1');
    } else {
        p2Choice = imageSrc;
        const portraits = document.querySelectorAll('#p2-selection .portrait');
        portraits.forEach(p => p.classList.remove('selected-p2'));
        document.getElementById(elementId).classList.add('selected-p2');
    }
}

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

        // Stats avancées
        this.perfectBlockWindow = 0;
        this.isStunned = false;
        this.stunTimer = 0;
        this.isKO = false;

        this.attackBox = {
            position: { x: this.position.x, y: this.position.y },
            radius: 25
        };
    }

    // (CORRIGÉ) L'image envoyée contient déjà le chemin
    setHead(imageSrc) {
        this.headImage.src = imageSrc;
    }

    draw() {
        const dir = this.side === 'left' ? 1 : -1;
        const centerX = this.position.x + this.width / 2;
        const topY = this.position.y;

        // --- Ombre dynamique au sol ---
        const shadowWidth = this.isGrounded ? 50 : 30 + (this.position.y / groundY) * 20;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(centerX, groundY + 5, shadowWidth, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();

        // KO Rotation
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

        // Clignotement Stun
        if (this.isStunned && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.strokeStyle = '#ffcc00';
            ctx.fillStyle = '#ffcc00';
        }

        // Head
        if (this.headImage.complete && this.headImage.naturalHeight !== 0) {
            ctx.drawImage(this.headImage, centerX - 30, topY - 15, 60, 60);
        } else {
            ctx.beginPath();
            ctx.arc(centerX, topY + 20, 18, 0, Math.PI * 2);
            ctx.fill();
        }

        // Torso
        ctx.beginPath();
        ctx.moveTo(centerX, topY + 45);
        ctx.lineTo(centerX, topY + 85);
        ctx.stroke();

        // Legs
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
            if (!this.isGrounded) legOffset = 5; // Jambes resserrées en l'air
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX - legOffset, topY + 130);
            ctx.moveTo(centerX, topY + 85);
            ctx.lineTo(centerX + legOffset, topY + 130);
        }
        ctx.stroke();

        // Arms
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
        } else if (this.isBlocking) {
            // Posture de garde
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

        // Hitbox Visuelle (Debug / Feedback)
        if (this.isAttacking) {
            ctx.fillStyle = this.attackType === 'punch' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 215, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Effet Bouclier (Block)
        if (this.isBlocking && !this.isKO) {
            ctx.lineWidth = 4;
            if (this.perfectBlockWindow > 0) {
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(centerX + (25 * dir), topY + 55, 35, -Math.PI / 2, Math.PI / 2, dir < 0);
                ctx.stroke();
            } else {
                ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
                ctx.beginPath();
                ctx.arc(centerX + (22 * dir), topY + 55, 28, -Math.PI / 2, Math.PI / 2, dir < 0);
                ctx.stroke();
            }
        }

        if (this.isStunned && !this.isKO) {
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText('⚡ STUNNED ⚡', centerX - 45, topY - 30);
        }

        ctx.restore();
    }

    update() {
        this.draw();

        if (this.perfectBlockWindow > 0) this.perfectBlockWindow--;
        if (this.stunTimer > 0) {
            this.stunTimer--;
            if (this.stunTimer <= 0) this.isStunned = false;
        }

        if (this.side === 'left') {
            this.attackBox.position.x = this.position.x + this.width;
        } else {
            this.attackBox.position.x = this.position.x - this.attackBox.width;
        }

        if (this.attackType === 'punch') {
            this.attackBox.radius = 25;
            this.attackBox.position.y = this.position.y + 50;
        } else if (this.attackType === 'kick') {
            this.attackBox.radius = 35;
            this.attackBox.position.y = this.position.y + 110;
        }

        if (this.side === 'left') {
            this.attackBox.position.x = this.position.x + this.width + 10;
        } else {
            this.attackBox.position.x = this.position.x - 10;
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

        if (this.cooldown > 0) {
            this.cooldown--;
        }

        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.attackType = null;
            }
        }
    }

    attack(type) {
        if (this.isAttacking || this.isStunned || this.isKO || this.isBlocking || this.cooldown > 0) return;

        this.isAttacking = true;
        this.attackType = type;

        if (type === 'punch') {
            this.attackTimer = 10;
            this.cooldown = 20;
        } else if (type === 'kick') {
            this.attackTimer = 25;
            this.cooldown = 50;
        }

        checkHit(this, this === player1 ? player2 : player1);
    }
}

const player1 = new Fighter({
    position: { x: 150, y: 0 },
    velocity: { x: 0, y: 0 },
    color: '#ff0055',
    side: 'left'
});

const player2 = new Fighter({
    position: { x: 800, y: 0 },
    velocity: { x: 0, y: 0 },
    color: '#00d2ff',
    side: 'right'
});

function circleRectCollision(circle, rect) {
    let testX = circle.position.x;
    let testY = circle.position.y;

    if (circle.position.x < rect.position.x) testX = rect.position.x;
    else if (circle.position.x > rect.position.x + rect.width) testX = rect.position.x + rect.width;

    if (circle.position.y < rect.position.y) testY = rect.position.y;
    else if (circle.position.y > rect.position.y + rect.height) testY = rect.position.y + rect.height;

    const distX = circle.position.x - testX;
    const distY = circle.position.y - testY;
    const distance = Math.sqrt((distX * distX) + (distY * distY));

    return distance <= circle.radius;
}

function checkHit(attacker, defender) {
    if (circleRectCollision(attacker.attackBox, defender)) {

        if (defender.isBlocking && !defender.isKO) {
            if (defender.perfectBlockWindow > 0) {
                attacker.isStunned = true;
                attacker.stunTimer = 120;
                attacker.velocity.x = 0;
                attacker.isAttacking = false;
                return;
            } else {
                let blockDamage = attacker.attackType === 'punch' ? 1 : 2;
                defender.health -= blockDamage;
                if (defender.health < 0) defender.health = 0;
                updateHealthUI();
                return;
            }
        }

        let damage = attacker.attackType === 'punch' ? 7 : 12;
        let knockbackDirection = attacker.side === 'left' ? 15 : -15;

        if (defender.isBlocking) {
            damage = Math.floor(damage * 0.25);
            knockbackDirection = knockbackDirection / 2;
        }

        defender.health -= damage;
        if (defender.health < 0) defender.health = 0;

        defender.position.x += knockbackDirection;

        updateHealthUI();
    }
}

function updateHealthUI() {
    document.getElementById('p1-health').style.width = player1.health + '%';
    document.getElementById('p2-health').style.width = player2.health + '%';
}

let timer = 99;
let timerId;
let gameOver = false;
let animationId;

function decreaseTimer() {
    if (timer > 0 && !gameOver && gameActive) {
        timerId = setTimeout(decreaseTimer, 1000);
        timer--;
        document.getElementById('timer').innerText = timer;
    }
    if (timer === 0) determineWinner();
}

function determineWinner() {
    clearTimeout(timerId);
    gameOver = true;
    const display = document.getElementById('display-text');
    const msg = document.getElementById('win-message');
    display.style.display = 'flex';

    if (player1.health === player2.health) {
        msg.innerText = "DRAW GAME";
    } else if (player1.health > player2.health) {
        msg.innerText = "PLAYER 1 WINS!";
    } else {
        msg.innerText = "PLAYER 2 WINS!";
    }
}

function startGame() {
    player1.setHead(p1Choice);
    player2.setHead(p2Choice);

    // Formatage et affichage des noms
    document.getElementById('p1-name').innerText = formatCharacterName(p1Choice);
    document.getElementById('p2-name').innerText = formatCharacterName(p2Choice);

    document.getElementById('character-select').style.display = 'none';
    document.getElementById('ui').style.display = 'flex';

    // Reset complet Player 1
    player1.health = 100;
    player1.position = { x: 150, y: 0 };
    player1.isKO = false;
    player1.isStunned = false;
    player1.isBlocking = false;
    player1.isAttacking = false;
    player1.cooldown = 0;

    // Reset complet Player 2
    player2.health = 100;
    player2.position = { x: 800, y: 0 };
    player2.isKO = false;
    player2.isStunned = false;
    player2.isBlocking = false;
    player2.isAttacking = false;
    player2.cooldown = 0;

    updateHealthUI();

    timer = 99;
    document.getElementById('timer').innerText = timer;
    document.getElementById('display-text').style.display = 'none';

    gameOver = false;
    gameActive = true;
    clearTimeout(timerId);
    decreaseTimer();

    if (!animationId) animate();
}

function returnToMenu() {
    gameActive = false;
    document.getElementById('display-text').style.display = 'none';
    document.getElementById('ui').style.display = 'none';
    document.getElementById('character-select').style.display = 'flex';
}

function animate() {
    if (!gameActive) {
        animationId = window.requestAnimationFrame(animate);
        return;
    }
    animationId = window.requestAnimationFrame(animate);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#111116';
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, groundY, canvas.width, 2);

    player1.update();
    player2.update();

    if (!player1.isKO && !player2.isKO) {
        if (player1.position.x < player2.position.x) {
            player1.side = 'left';
            player2.side = 'right';
        } else {
            player1.side = 'right';
            player2.side = 'left';
        }
    }

    player1.isBlocking = keys.s.pressed && player1.isGrounded;
    player2.isBlocking = keys.ArrowDown.pressed && player2.isGrounded;

    player1.velocity.x = 0;
    if (!player1.isStunned && !player1.isKO && !player1.isBlocking) {
        if (keys.a.pressed) player1.velocity.x = -6;
        else if (keys.d.pressed) player1.velocity.x = 6;
    }

    player2.velocity.x = 0;
    if (!player2.isStunned && !player2.isKO && !player2.isBlocking) {
        if (keys.ArrowLeft.pressed) player2.velocity.x = -6;
        else if (keys.ArrowRight.pressed) player2.velocity.x = 6;
    }

    if ((player1.health <= 0 || player2.health <= 0) && !gameOver) {
        if (player1.health <= 0) player1.isKO = true;
        if (player2.health <= 0) player2.isKO = true;

        gameOver = true;
        setTimeout(() => {
            determineWinner();
        }, 1500);
    }
}

window.addEventListener('keydown', (event) => {
    if (gameOver || !gameActive) return;

    const key = event.key.toLowerCase();
    const canP1Act = !player1.isStunned && !player1.isKO;
    const canP2Act = !player2.isStunned && !player2.isKO;

    switch (key) {
        // --- Joueur 1 ---
        case 'd':
            if (canP1Act && !player1.isBlocking) keys.d.pressed = true;
            break;
        case 'a':
        case 'q':
            if (canP1Act && !player1.isBlocking) keys.a.pressed = true;
            break;
        case 'w':
        case 'z':
            if (canP1Act && player1.isGrounded && !player1.isBlocking) player1.velocity.y = -18;
            break;
        case 's':
            if (canP1Act && player1.isGrounded && !player1.isAttacking) {
                keys.s.pressed = true;
                if (!player1.isBlocking) {
                    player1.isBlocking = true;
                    player1.perfectBlockWindow = 10;
                }
            }
            break;
        case 'f':
            if (canP1Act) player1.attack('punch');
            break;
        case 'g':
            if (canP1Act) player1.attack('kick');
            break;

        // --- Joueur 2 ---
        case 'arrowright':
            if (canP2Act && !player2.isBlocking) keys.ArrowRight.pressed = true;
            break;
        case 'arrowleft':
            if (canP2Act && !player2.isBlocking) keys.ArrowLeft.pressed = true;
            break;
        case 'arrowup':
            if (canP2Act && player2.isGrounded && !player2.isBlocking) player2.velocity.y = -18;
            break;
        case 'arrowdown':
            if (canP2Act && player2.isGrounded && !player2.isAttacking) {
                keys.ArrowDown.pressed = true;
                if (!player2.isBlocking) {
                    player2.isBlocking = true;
                    player2.perfectBlockWindow = 10;
                }
            }
            break;
    }

    if (event.code === 'ShiftRight' && canP2Act) player2.attack('punch');
    if (event.code === 'ControlRight' && canP2Act) player2.attack('kick');
});

window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();

    switch (key) {
        // --- Joueur 1 ---
        case 'd':
            keys.d.pressed = false;
            break;
        case 'a':
        case 'q':
            keys.a.pressed = false;
            break;
        case 's':
            keys.s.pressed = false;
            player1.isBlocking = false;
            break;

        // --- Joueur 2 ---
        case 'arrowright':
            keys.ArrowRight.pressed = false;
            break;
        case 'arrowleft':
            keys.ArrowLeft.pressed = false;
            break;
        case 'arrowdown':
            keys.ArrowDown.pressed = false;
            player2.isBlocking = false;
            break;
    }
});

animate();