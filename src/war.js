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
    a: { pressed: false }, d: { pressed: false }, w: { pressed: false },
    ArrowLeft: { pressed: false }, ArrowRight: { pressed: false }, ArrowUp: { pressed: false }
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
        this.cooldown = 0; // Temps de récupération avant la prochaine attaque
        this.headImage = new Image();

        // Zone d'attaque circulaire
        this.attackBox = {
            position: { x: this.position.x, y: this.position.y },
            radius: 25
        };
    }

    setHead(imageSrc) {
        // Chemin du dossier des images
        this.headImage.src = '../asset/character/' + imageSrc;
    }

    draw() {
        const dir = this.side === 'left' ? 1 : -1;
        const centerX = this.position.x + this.width / 2;
        const topY = this.position.y;

        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

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
        if (this.isAttacking && this.attackType === 'kick') {
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
        if (this.isAttacking && this.attackType === 'punch') {
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

        // Visuel de l'Attack Box en cercle
        if (this.isAttacking) {
            ctx.fillStyle = this.attackType === 'punch' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 215, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    update() {
        this.draw();

        // Position et taille des cercles d'attaque selon le type de coup
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

        // Gestion du temps de récupération (cooldown)
        if (this.cooldown > 0) {
            this.cooldown--;
        }

        // Gestion de la durée de l'attaque affichée à l'écran
        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.attackType = null;
            }
        }
    }

    attack(type) {
        // Bloque l'attaque si le joueur attaque déjà ou s'il est en période de récupération
        if (this.isAttacking || this.cooldown > 0) return;

        this.isAttacking = true;
        this.attackType = type;

        // Configuration des vitesses d'attaque (Poing = 1x, Pied = 2.5x plus lent)
        if (type === 'punch') {
            this.attackTimer = 10; // Durée visuelle du coup
            this.cooldown = 20;    // Temps de pause avant le prochain coup
        } else if (type === 'kick') {
            this.attackTimer = 25; // 2.5x plus long
            this.cooldown = 50;    // 2.5x plus long
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

// Fonction mathématique pour calculer la collision Cercle/Rectangle
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
    // Utilisation de la collision Cercle/Rectangle
    if (circleRectCollision(attacker.attackBox, defender)) {
        const damage = attacker.attackType === 'punch' ? 7 : 12;
        defender.health -= damage;
        if (defender.health < 0) defender.health = 0;

        const knockbackDirection = attacker.side === 'left' ? 15 : -15;
        defender.position.x += knockbackDirection;

        if (defender === player2) {
            document.getElementById('p2-health').style.width = defender.health + '%';
        } else {
            document.getElementById('p1-health').style.width = defender.health + '%';
        }
    }
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

    player1.health = 100;
    player1.position = { x: 150, y: 0 };
    player1.cooldown = 0;
    player1.isAttacking = false;

    player2.health = 100;
    player2.position = { x: 800, y: 0 };
    player2.cooldown = 0;
    player2.isAttacking = false;

    document.getElementById('p1-health').style.width = '100%';
    document.getElementById('p2-health').style.width = '100%';

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

    if (player1.position.x < player2.position.x) {
        player1.side = 'left';
        player2.side = 'right';
    } else {
        player1.side = 'right';
        player2.side = 'left';
    }

    player1.velocity.x = 0;
    if (keys.a.pressed) player1.velocity.x = -6;
    else if (keys.d.pressed) player1.velocity.x = 6;

    player2.velocity.x = 0;
    if (keys.ArrowLeft.pressed) player2.velocity.x = -6;
    else if (keys.ArrowRight.pressed) player2.velocity.x = 6;

    if ((player1.health <= 0 || player2.health <= 0) && !gameOver) {
        determineWinner();
    }
}

window.addEventListener('keydown', (event) => {
    if (gameOver || !gameActive) return;

    const key = event.key.toLowerCase();

    switch (key) {
        // Joueur 1 (Support AZERTY/QWERTY combiné)
        case 'd': 
            keys.d.pressed = true; 
            break;
        case 'a': 
        case 'q': 
            keys.a.pressed = true; 
            break;
        case 'w': 
        case 'z': 
            if (player1.isGrounded) player1.velocity.y = -18; 
            break;
        case 'f': 
            player1.attack('punch'); 
            break;
        case 'g': 
            player1.attack('kick'); 
            break;

        // Joueur 2
        case 'arrowright': 
            keys.ArrowRight.pressed = true; 
            break;
        case 'arrowleft': 
            keys.ArrowLeft.pressed = true; 
            break;
        case 'arrowup': 
            if (player2.isGrounded) player2.velocity.y = -18; 
            break;
    }

    if (event.code === 'ShiftRight') player2.attack('punch');
    if (event.code === 'ControlRight') player2.attack('kick');
});

window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    
    switch (key) {
        case 'd': 
            keys.d.pressed = false; 
            break;
        case 'a': 
        case 'q': 
            keys.a.pressed = false; 
            break;
        case 'arrowright': 
            keys.ArrowRight.pressed = false; 
            break;
        case 'arrowleft': 
            keys.ArrowLeft.pressed = false; 
            break;
    }
});

animate();