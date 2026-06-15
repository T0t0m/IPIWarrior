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
        this.headImage = new Image();

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

        // Attack Box visual
        if (this.isAttacking) {
            ctx.fillStyle = this.attackType === 'punch' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 215, 0, 0.3)';
            ctx.fillRect(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.width, this.attackBox.height);
        }
    }

    update() {
        this.draw();

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
        if (this.isAttacking) return;
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
    // Apply selected heads
    player1.setHead(p1Choice);
    player2.setHead(p2Choice);

    // UI Switches
    document.getElementById('character-select').style.display = 'none';
    document.getElementById('ui').style.display = 'flex';

    // Reset state
    player1.health = 100;
    player1.position = { x: 150, y: 0 };
    player2.health = 100;
    player2.position = { x: 800, y: 0 };
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
        return; // Pause rendering if in menu
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

    switch (event.key) {
        case 'd': case 'D': keys.d.pressed = true; break;
        case 'a': case 'A': keys.a.pressed = true; break;
        case 'w': case 'W': if (player1.isGrounded) player1.velocity.y = -18; break;
        case 'f': case 'F': player1.attack('punch'); break;
        case 'g': case 'G': player1.attack('kick'); break;

        case 'ArrowRight': keys.ArrowRight.pressed = true; break;
        case 'ArrowLeft': keys.ArrowLeft.pressed = true; break;
        case 'ArrowUp': if (player2.isGrounded) player2.velocity.y = -18; break;
    }

    if (event.code === 'ShiftRight') player2.attack('punch');
    if (event.code === 'ControlRight') player2.attack('kick');
});

window.addEventListener('keyup', (event) => {
    switch (event.key) {
        case 'd': case 'D': keys.d.pressed = false; break;
        case 'a': case 'A': keys.a.pressed = false; break;
        case 'ArrowRight': keys.ArrowRight.pressed = false; break;
        case 'ArrowLeft': keys.ArrowLeft.pressed = false; break;
    }
});

// Start background loop, but keep game paused until "FIGHT!" is clicked
animate();