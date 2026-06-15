const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1024;
canvas.height = 576;

const gravity = 0.7;
const groundY = 480;

// Default Selections
let p1Choice = 'fx.png';
let p2Choice = 'kotlineur.png';
let gameActive = false;

// Track key states
const keys = {
    a: { pressed: false }, d: { pressed: false }, w: { pressed: false }, s: { pressed: false },
    ArrowLeft: { pressed: false }, ArrowRight: { pressed: false }, ArrowUp: { pressed: false }, ArrowDown: { pressed: false }
};

// UI Menu Logic
function selectChar(playerNum, imageSrc, elementId) {
    if (playerNum === 1) {
        p1Choice = imageSrc;
        document.getElementById('p1-fx').classList.remove('selected-p1');
        document.getElementById('p1-kotlineur').classList.remove('selected-p1');
        document.getElementById('p1-etienne').classList.remove('selected-p1');
        document.getElementById(elementId).classList.add('selected-p1');
    } else {
        p2Choice = imageSrc;
        document.getElementById('p2-fx').classList.remove('selected-p2');
        document.getElementById('p2-kotlineur').classList.remove('selected-p2');
        document.getElementById('p2-etienne').classList.remove('selected-p2');
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
        this.attackType = null;
        this.attackTimer = 0;
        this.headImage = new Image();

        // Nouveaux états : Garde, Stun et KO
        this.isBlocking = false;
        this.perfectBlockWindow = 0; // Fenêtre de frames pour le perfect block
        this.isStunned = false;
        this.stunTimer = 0;
        this.isKO = false;

        this.attackBox = {
            position: { x: this.position.x, y: this.position.y },
            width: 100,
            height: 40
        };
    }

    setHead(imageSrc) {
        this.headImage.src = imageSrc;
    }

    draw() {
        const dir = this.side === 'left' ? 1 : -1;
        const centerX = this.position.x + this.width / 2;
        const topY = this.position.y;

        ctx.save(); // Sauvegarde pour l'animation de KO (rotation)

        // Animation de KO : Le personnage bascule sur le côté
        if (this.isKO) {
            ctx.translate(centerX, topY + 130); // Pivot au niveau des pieds
            ctx.rotate(this.side === 'left' ? -Math.PI / 2 : Math.PI / 2);
            ctx.translate(-centerX, -(topY + 130));
        }

        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Clignotement si étourdi (Stun)
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
        } else if (this.isBlocking) {
            // Posture de garde (bras croisés devant)
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (25 * dir), topY + 45);
            ctx.lineTo(centerX + (20 * dir), topY + 65);
        } else if (this.isAttacking && this.attackType === 'punch') {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX - (20 * dir), topY + 75);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + (50 * dir), topY + 50);
        } else {
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX - 15, topY + 80);
            ctx.moveTo(centerX, topY + 50);
            ctx.lineTo(centerX + 15, topY + 80);
        }
        ctx.stroke();

        // Attack Box visual
        if (this.isAttacking) {
            ctx.fillStyle = this.attackType === 'punch' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 215, 0, 0.3)';
            ctx.fillRect(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.width, this.attackBox.height);
        }

        // Effets visuels de Garde (Bouclier)
        if (this.isBlocking && !this.isKO) {
            ctx.lineWidth = 4;
            if (this.perfectBlockWindow > 0) {
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'; // Cyan pour le parfait
                ctx.beginPath();
                ctx.arc(centerX + (25 * dir), topY + 55, 35, -Math.PI / 2, Math.PI / 2, dir < 0);
                ctx.stroke();
            } else {
                ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)'; // Gris pour la garde normale
                ctx.beginPath();
                ctx.arc(centerX + (22 * dir), topY + 55, 28, -Math.PI / 2, Math.PI / 2, dir < 0);
                ctx.stroke();
            }
        }

        // Indicateur textuel de Stun
        if (this.isStunned && !this.isKO) {
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText('⚡ STUNNED ⚡', centerX - 45, topY - 30);
        }

        ctx.restore(); // Rétablissement du contexte
    }

    update() {
        this.draw();

        // Diminution des timers de statut
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
            this.attackBox.position.y = this.position.y + 35;
            this.attackBox.width = 60;
            this.attackBox.height = 30;
        } else if (this.attackType === 'kick') {
            this.attackBox.position.y = this.position.y + 75;
            this.attackBox.width = 70;
            this.attackBox.height = 40;
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

        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.attackType = null;
            }
        }
    }

    attack(type) {
        if (this.isAttacking || this.isStunned || this.isKO || this.isBlocking) return;
        this.isAttacking = true;
        this.attackType = type;
        this.attackTimer = 12;
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

function rectangularCollision({ rectangle1, rectangle2 }) {
    return (
        rectangle1.attackBox.position.x + rectangle1.attackBox.width >= rectangle2.position.x &&
        rectangle1.attackBox.position.x <= rectangle2.position.x + rectangle2.width &&
        rectangle1.attackBox.position.y + rectangle1.attackBox.height >= rectangle2.position.y &&
        rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
    )
}

function checkHit(attacker, defender) {
    if (rectangularCollision({ rectangle1: attacker, rectangle2: defender })) {

        // Gestion de la Garde
        if (defender.isBlocking && !defender.isKO) {
            if (defender.perfectBlockWindow > 0) {
                // PERFECT BLOCK : L'attaquant est immobilisé pendant 2 secondes (120 frames à 60fps)
                attacker.isStunned = true;
                attacker.stunTimer = 120;
                attacker.velocity.x = 0;
                attacker.isAttacking = false;
                return; // Aucun dégât, aucun recul
            } else {
                // Garde Normale : Dégâts très réduits, pas de recul
                defender.health -= attacker.attackType === 'punch' ? 1 : 2;
                if (defender.health < 0) defender.health = 0;
                updateHealthUI();
                return;
            }
        }

        // Coup normal (Sans garde)
        const damage = attacker.attackType === 'punch' ? 7 : 12;
        defender.health -= damage;
        if (defender.health < 0) defender.health = 0;

        const knockbackDirection = attacker.side === 'left' ? 15 : -15;
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

    document.getElementById('character-select').style.display = 'none';
    document.getElementById('ui').style.display = 'flex';

    // Reset complet des états
    player1.health = 100;
    player1.position = { x: 150, y: 0 };
    player1.isKO = false;
    player1.isStunned = false;
    player1.isBlocking = false;

    player2.health = 100;
    player2.position = { x: 800, y: 0 };
    player2.isKO = false;
    player2.isStunned = false;
    player2.isBlocking = false;

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

    // Orientation face à face (uniquement si vivant)
    if (!player1.isKO && !player2.isKO) {
        if (player1.position.x < player2.position.x) {
            player1.side = 'left';
            player2.side = 'right';
        } else {
            player1.side = 'right';
            player2.side = 'left';
        }
    }

    // Mouvements Joueur 1
    player1.velocity.x = 0;
    if (!player1.isStunned && !player1.isKO && !player1.isBlocking) {
        if (keys.a.pressed) player1.velocity.x = -6;
        else if (keys.d.pressed) player1.velocity.x = 6;
    }

    // Mouvements Joueur 2
    player2.velocity.x = 0;
    if (!player2.isStunned && !player2.isKO && !player2.isBlocking) {
        if (keys.ArrowLeft.pressed) player2.velocity.x = -6;
        else if (keys.ArrowRight.pressed) player2.velocity.x = 6;
    }

    // Vérification du KO et déclenchement de l'animation avant la fin de partie
    if ((player1.health <= 0 || player2.health <= 0) && !gameOver) {
        if (player1.health <= 0) player1.isKO = true;
        if (player2.health <= 0) player2.isKO = true;

        gameOver = true;
        // On laisse 1.5 seconde pour voir l'animation du personnage tomber au sol
        setTimeout(() => {
            determineWinner();
        }, 1500);
    }
}

window.addEventListener('keydown', (event) => {
    if (gameOver || !gameActive) return;

    const key = event.key.toLowerCase();

    // Vérifications d'action
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
        case 's': // Garde P1
            if (canP1Act && player1.isGrounded && !player1.isAttacking) {
                keys.s.pressed = true;
                if (!player1.isBlocking) {
                    player1.isBlocking = true;
                    player1.perfectBlockWindow = 10; // Fenêtre active durant les 10 premières frames
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
        case 'arrowdown': // Garde P2
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
        case 'd': keys.d.pressed = false; break;
        case 'a':
        case 'q': keys.a.pressed = false; break;
        case 's': // Relâcher Garde P1
            keys.s.pressed = false;
            player1.isBlocking = false;
            break;

        case 'arrowright': keys.ArrowRight.pressed = false; break;
        case 'arrowleft': keys.ArrowLeft.pressed = false; break;
        case 'arrowdown': // Relâcher Garde P2
            keys.ArrowDown.pressed = false;
            player2.isBlocking = false;
            break;
    }
});

animate();