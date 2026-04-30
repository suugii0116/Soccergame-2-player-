const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1000;
canvas.height = 600;
const GRAVITY = 0.5;
const FRICTION = 0.98;
const FLOOR_Y = canvas.height - 25;
const GOAL_HEIGHT = 180;
let score1 = 0;
let score2 = 0;
let timeLeft = 90;
let isGameOver = false;
let isGoalScoring = false;

// Input handling
const keys = { KeyA: false, KeyD: false, KeyW: false, ArrowLeft: false, ArrowRight: false, ArrowUp: false, Space: false, Enter: false, NumpadEnter: false };
let guestInputs = { left: false, right: false, up: false, kick: false };

document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
});
document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// Networking
const isHost = !window.location.hash;
let peer;
let conn;
let isMultiplayerConnected = false;
let isGameStarted = false;

class Ball {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.vx = 0;
        this.vy = 0;
        this.restitution = 0.8;
        this.trail = [];
        this.angle = 0;
    }
    draw() {
        if (this.trail.length > 0) {
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = this.radius * 1.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffffff';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#111111';
        this.drawPentagon(ctx, 0, 0, this.radius * 0.4, 0);
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * this.radius * 0.4, Math.sin(angle) * this.radius * 0.4);
            ctx.lineTo(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius);
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 2;
            ctx.stroke();
            this.drawPentagon(ctx, Math.cos(angle) * this.radius * 0.85, Math.sin(angle) * this.radius * 0.85, this.radius * 0.25, angle);
        }
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f0f1b';
        ctx.stroke();
        ctx.restore();
    }
    drawPentagon(ctx, x, y, size, rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
            const px = Math.cos(angle) * size;
            const py = Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    update() {
        this.vy += GRAVITY;
        this.vx *= FRICTION;
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.vx * 0.05;
        
        if (this.y + this.radius > FLOOR_Y) {
            this.y = FLOOR_Y - this.radius;
            this.vy *= -this.restitution;
            this.vx *= 0.98;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy *= -this.restitution;
        }
        
        const goalTop = (canvas.height / 2) - (GOAL_HEIGHT / 2);
        const goalBottom = goalTop + GOAL_HEIGHT;
        const gw = 15;
        
        if (this.x - this.radius < gw) {
            if (this.y < goalTop || this.y > goalBottom) {
                this.x = this.radius + gw;
                this.vx *= -this.restitution;
            } else if (this.x - this.radius < 0 && !isGoalScoring) {
                triggerGoal(2);
            }
        }
        if (this.x + this.radius > canvas.width - gw) {
            if (this.y < goalTop || this.y > goalBottom) {
                this.x = canvas.width - this.radius - gw;
                this.vx *= -this.restitution;
            } else if (this.x + this.radius > canvas.width && !isGoalScoring) {
                triggerGoal(1);
            }
        }
        
        if (isGoalScoring) {
            if (this.x < -30) { this.x = -30; this.vx = 0; }
            if (this.x > canvas.width + 30) { this.x = canvas.width + 30; this.vx = 0; }
        }
        
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.shift();
    }
}

class Player {
    constructor(x, y, radius, color, isDefendingRight) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.vx = 0;
        this.vy = 0;
        this.color = color;
        this.jumpPower = -19;
        this.isDefendingRight = isDefendingRight;
        this.grounded = false;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, Math.PI, Math.PI * 2);
        ctx.lineTo(this.x + this.radius, this.y);
        ctx.lineTo(this.x - this.radius, this.y);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
        
        ctx.beginPath();
        let eyeOffsetX = this.isDefendingRight ? -12 : 12;
        ctx.arc(this.x + eyeOffsetX, this.y - 15, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(this.x + eyeOffsetX + (this.isDefendingRight ? -3 : 3), this.y - 15, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
    }
    update() {
        this.vy += GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.85;
        this.grounded = false;
        if (this.y > FLOOR_Y) {
            this.y = FLOOR_Y;
            this.vy = 0;
            this.grounded = true;
        }
        const gw = 15;
        if (this.x - this.radius < gw) { this.x = this.radius + gw; this.vx = 0; }
        if (this.x + this.radius > canvas.width - gw) { this.x = canvas.width - this.radius - gw; this.vx = 0; }
    }
    updatePlayer1Control() {
        if (isGameOver || isGoalScoring) return;
        if (keys.KeyA || keys.ArrowLeft) this.vx -= 1.5;
        if (keys.KeyD || keys.ArrowRight) this.vx += 1.5;
        if ((keys.KeyW || keys.ArrowUp) && this.grounded) this.vy = this.jumpPower;
    }
    updatePlayer2Control() {
        if (isGameOver || isGoalScoring) return;
        if (guestInputs.left) this.vx -= 1.5;
        if (guestInputs.right) this.vx += 1.5;
        if (guestInputs.up && this.grounded) this.vy = this.jumpPower;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 15;
        this.vy = (Math.random() - 0.5) * 15;
        this.radius = Math.random() * 5 + 2;
        this.color = color;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.01;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

let ball, player1, player2, particles = [];
let timerInterval;
let flashAlpha = 0;

function setupMultiplayer() {
    peer = new Peer();
    
    peer.on('open', id => {
        if (isHost) {
            const inviteLink = window.location.origin + window.location.pathname + '#' + id;
            document.getElementById('host-ui').innerHTML = `
                <div class="lobby-text">Send this link to your friend:</div>
                <input type="text" value="${inviteLink}" readonly style="width:450px; padding:15px; font-size:1.2rem; border-radius:10px; border:none; text-align:center; margin-bottom:10px; color:#000; background:#fff; font-weight:bold;">
                <br>
                <button class="invite-btn" onclick="navigator.clipboard.writeText('${inviteLink}').then(()=>alert('Copied!'))">Copy Link</button>
                <div class="lobby-text" style="margin-top:30px; font-size:1.5rem; opacity:0.8;">Waiting for player to join...</div>
            `;
        } else {
            document.getElementById('host-ui').classList.add('hidden');
            document.getElementById('join-ui').classList.remove('hidden');
            const hostId = window.location.hash.substring(1);
            conn = peer.connect(hostId);
            conn.on('open', () => {
                isMultiplayerConnected = true;
                startGameUI();
            });
            conn.on('data', handleNetworkData);
        }
    });

    if (isHost) {
        peer.on('connection', connection => {
            conn = connection;
            conn.on('open', () => {
                isMultiplayerConnected = true;
                startGameUI();
            });
            conn.on('data', handleNetworkData);
        });
    }
}

function startGameUI() {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-wrapper').classList.remove('hidden');
    
    if (!isHost) {
        document.querySelector('.controls-hint').innerText = "Controls: W/A/D or Arrows (Move) + Space or Enter (Kick)";
        document.getElementById('restart-btn').classList.add('hidden');
    }

    if (isHost) {
        initHost();
    } else {
        initGuest();
    }
}

function initHost() {
    ball = new Ball(canvas.width / 2, 100, 15);
    player1 = new Player(200, FLOOR_Y, 40, '#00f3ff', false);
    player2 = new Player(canvas.width - 200, FLOOR_Y, 40, '#ff003c', true);
    score1 = score2 = 0;
    timeLeft = 90;
    isGameOver = false;
    isGoalScoring = false;
    particles = [];
    updateScoreUI();
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('goal-screen').classList.add('hidden');
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!isGameOver && !isGoalScoring) {
            timeLeft--;
            updateTimerUI();
            if (timeLeft <= 0) endGame();
        }
    }, 1000);
    updateTimerUI();
    
    if (!isGameStarted) {
        isGameStarted = true;
        gameLoopHost();
    }
    
    if (isMultiplayerConnected && conn) {
        conn.send({ type: 'restart' });
    }
}

function initGuest() {
    ball = new Ball(canvas.width / 2, 100, 15);
    player1 = new Player(200, FLOOR_Y, 40, '#00f3ff', false);
    player2 = new Player(canvas.width - 200, FLOOR_Y, 40, '#ff003c', true);
    particles = [];
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('goal-screen').classList.add('hidden');
    
    if (!isGameStarted) {
        isGameStarted = true;
        gameLoopGuest();
    }
}

function resetPositions() {
    ball.x = canvas.width / 2;
    ball.y = 150;
    ball.vx = ball.vy = 0;
    ball.trail = [];
    player1.x = 200; player1.y = FLOOR_Y; player1.vx = player1.vy = 0;
    player2.x = canvas.width - 200; player2.y = FLOOR_Y; player2.vx = player2.vy = 0;
    isGoalScoring = false;
}

function triggerGoal(player) {
    if (isGoalScoring || isGameOver) return;
    isGoalScoring = true;
    flashAlpha = 1.0;
    if (player === 1) score1++; else score2++;
    updateScoreUI();

    const goalX = player === 1 ? canvas.width : 0;
    createExplosion(goalX, ball.y, player === 1 ? '#00f3ff' : '#ff003c');

    for (let i = 0; i < 40; i++) {
        let p = new Particle(goalX, ball.y, '#ffffff');
        p.radius *= 3;
        particles.push(p);
    }
    showGoalScreen(player);

    if (isMultiplayerConnected && conn) {
        conn.send({ type: 'particles', x: goalX, y: ball.y, color: player === 1 ? '#00f3ff' : '#ff003c', count: 60, big: false });
        conn.send({ type: 'particles', x: goalX, y: ball.y, color: '#ffffff', count: 40, big: true });
        conn.send({ type: 'goal', p: player });
    }

    setTimeout(() => {
        document.getElementById('goal-screen').classList.add('hidden');
        resetPositions();
    }, 2000);
}

function showGoalScreen(player) {
    const goalScreen = document.getElementById('goal-screen');
    goalScreen.querySelector('.goal-text').style.textShadow = player === 1 ? '0 0 50px #00f3ff, 0 0 80px #00f3ff' : '0 0 50px #ff003c, 0 0 80px #ff003c';
    goalScreen.querySelector('.goal-text').style.color = player === 1 ? '#00f3ff' : '#ff003c';
    goalScreen.classList.remove('hidden');
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 60; i++) particles.push(new Particle(x, y, color));
}

function updateScoreUI() {
    document.getElementById('score1').innerText = score1;
    document.getElementById('score2').innerText = score2;
}

function updateTimerUI() {
    document.getElementById('timer').innerText =
        `${Math.floor(timeLeft / 60).toString().padStart(2, '0')}:${(timeLeft % 60).toString().padStart(2, '0')}`;
}

function resolveCollision(player, ball) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < player.radius + ball.radius) {
        const angle = Math.atan2(dy, dx);
        const overlap = (player.radius + ball.radius) - distance;
        ball.x += Math.cos(angle) * overlap;
        ball.y += Math.sin(angle) * overlap;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const relVx = ball.vx - player.vx;
        const relVy = ball.vy - player.vy;
        const velocityAlongNormal = relVx * nx + relVy * ny;
        if (velocityAlongNormal > 0) return;
        const e = 0.8;
        let j = -(1 + e) * velocityAlongNormal;
        j *= 1.1;
        ball.vx += j * nx;
        ball.vy += j * ny;
        
        if (Math.abs(player.vx) > 1 || player.vy < -1) {
            createExplosion(ball.x - nx * ball.radius, ball.y - ny * ball.radius, '#ffffff');
            if (isMultiplayerConnected && conn) {
                conn.send({ type: 'particles', x: ball.x - nx * ball.radius, y: ball.y - ny * ball.radius, color: '#ffffff', count: 60, big: false });
            }
        }
    }
}

function checkKick(player, ball, isKicking, playerIndex) {
    if (!isKicking) return;
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < player.radius + ball.radius + 35) {
        let kickPowerX = 35;
        let kickPowerY = -22;
        const dirX = playerIndex === 1 ? 1 : -1;
        
        ball.vx = dirX * kickPowerX + (player.vx * 0.5);
        ball.vy = kickPowerY;
        
        createExplosion(ball.x, ball.y, player.color);
        for(let i=0; i<15; i++) {
            let p = new Particle(ball.x, ball.y, '#ffffff');
            p.vx *= 2; p.vy *= 2;
            particles.push(p);
        }
        
        if (isMultiplayerConnected && conn) {
            conn.send({ type: 'particles', x: ball.x, y: ball.y, color: player.color, count: 60, big: false });
            conn.send({ type: 'particles', x: ball.x, y: ball.y, color: '#ffffff', count: 15, big: false, fast: true });
        }
        
        if (playerIndex === 1) { keys.Space = false; keys.Enter = false; keys.NumpadEnter = false; }
        if (playerIndex === 2) guestInputs.kick = false;
    }
}

function drawPitch() {
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(0, 0, canvas.width, FLOOR_Y);
    ctx.fillStyle = '#40916c';
    for (let i = 0; i < canvas.width; i += 100) {
        ctx.fillRect(i, 0, 50, FLOOR_Y);
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, FLOOR_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, FLOOR_Y, 100, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1b4332';
    ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, FLOOR_Y); ctx.lineTo(canvas.width, FLOOR_Y); ctx.stroke();
    const goalTop = (canvas.height / 2) - (GOAL_HEIGHT / 2);
    const gw = 15;

    ctx.fillStyle = '#1b4332';
    ctx.fillRect(0, 0, gw, goalTop);
    ctx.fillRect(0, goalTop + GOAL_HEIGHT, gw, FLOOR_Y - (goalTop + GOAL_HEIGHT));
    ctx.fillRect(canvas.width - gw, 0, gw, goalTop);
    ctx.fillRect(canvas.width - gw, goalTop + GOAL_HEIGHT, gw, FLOOR_Y - (goalTop + GOAL_HEIGHT));
    
    ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
    ctx.fillRect(0, goalTop, gw, GOAL_HEIGHT);
    ctx.beginPath();
    ctx.moveTo(gw, goalTop);
    ctx.lineTo(gw, goalTop + GOAL_HEIGHT);
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 15; ctx.shadowColor = '#00f3ff'; ctx.stroke(); ctx.shadowBlur = 0;
    
    ctx.fillStyle = 'rgba(255, 0, 60, 0.15)';
    ctx.fillRect(canvas.width - gw, goalTop, gw, GOAL_HEIGHT);
    ctx.beginPath();
    ctx.moveTo(canvas.width - gw, goalTop);
    ctx.lineTo(canvas.width - gw, goalTop + GOAL_HEIGHT);
    ctx.strokeStyle = '#ff003c';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 15; ctx.shadowColor = '#ff003c'; ctx.stroke(); ctx.shadowBlur = 0;
}

function endGame() {
    isGameOver = true;
    const gameOverScreen = document.getElementById('game-over-screen');
    const winnerText = document.getElementById('winner-text');
    gameOverScreen.classList.remove('hidden');
    if (score1 > score2) {
        winnerText.innerText = "PLAYER 1 WINS!";
        winnerText.style.color = '#00f3ff';
    } else if (score2 > score1) {
        winnerText.innerText = "PLAYER 2 WINS!";
        winnerText.style.color = '#ff003c';
    } else {
        winnerText.innerText = "DRAW!";
        winnerText.style.color = '#ffffff';
    }
    
    if (isHost) {
        document.getElementById('restart-btn').classList.remove('hidden');
        document.getElementById('guest-waiting-msg').classList.add('hidden');
    } else {
        document.getElementById('restart-btn').classList.add('hidden');
        document.getElementById('guest-waiting-msg').classList.remove('hidden');
    }
}

document.getElementById('restart-btn').addEventListener('click', () => {
    if (isHost) initHost();
});

function gameLoopHost() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPitch();
    
    if (!isGameOver) {
        player1.updatePlayer1Control();
        player1.update();
        player2.updatePlayer2Control();
        player2.update();
        
        if (!isGoalScoring) {
            resolveCollision(player1, ball);
            resolveCollision(player2, ball);
            checkKick(player1, ball, (keys.Space || keys.Enter || keys.NumpadEnter), 1);
            checkKick(player2, ball, guestInputs.kick, 2);
        }
        ball.update();
    }
    
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    player1.draw();
    player2.draw();
    ball.draw();
    
    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashAlpha -= 0.05;
    }
    
    if (isMultiplayerConnected && conn) {
        conn.send({
            type: 'state',
            b: { x: ball.x, y: ball.y, t: ball.trail, a: ball.angle },
            p1: { x: player1.x, y: player1.y },
            p2: { x: player2.x, y: player2.y },
            s: { s1: score1, s2: score2, t: timeLeft },
            g: isGameOver,
            gs: isGoalScoring,
            fa: flashAlpha
        });
    }
    
    requestAnimationFrame(gameLoopHost);
}

function gameLoopGuest() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPitch();
    
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    player1.draw();
    player2.draw();
    ball.draw();
    
    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashAlpha -= 0.05;
    }
    
    if (isMultiplayerConnected && conn) {
        conn.send({ 
            type: 'input', 
            keys: {
                left: keys.KeyA || keys.ArrowLeft,
                right: keys.KeyD || keys.ArrowRight,
                up: keys.KeyW || keys.ArrowUp,
                kick: keys.Space || keys.Enter || keys.NumpadEnter
            }
        });
    }
    
    requestAnimationFrame(gameLoopGuest);
}

function handleNetworkData(data) {
    if (isHost) {
        if (data.type === 'input') {
            guestInputs = data.keys;
        }
    } else {
        if (data.type === 'state') {
            ball.x = data.b.x; ball.y = data.b.y;
            ball.trail = data.b.t;
            ball.angle = data.b.a;
            
            player1.x = data.p1.x; player1.y = data.p1.y;
            player2.x = data.p2.x; player2.y = data.p2.y;
            
            if (score1 !== data.s.s1 || score2 !== data.s.s2) {
                score1 = data.s.s1; score2 = data.s.s2;
                updateScoreUI();
            }
            if (timeLeft !== data.s.t) {
                timeLeft = data.s.t;
                updateTimerUI();
            }
            
            isGameOver = data.g;
            isGoalScoring = data.gs;
            flashAlpha = data.fa;
            
            if (isGameOver && document.getElementById('game-over-screen').classList.contains('hidden')) {
                endGame();
            }
        } else if (data.type === 'particles') {
            for (let i = 0; i < data.count; i++) {
                let p = new Particle(data.x, data.y, data.color);
                if (data.big) p.radius *= 3;
                if (data.fast) { p.vx *= 2; p.vy *= 2; }
                particles.push(p);
            }
        } else if (data.type === 'goal') {
            showGoalScreen(data.p);
            setTimeout(() => { document.getElementById('goal-screen').classList.add('hidden'); }, 2000);
        } else if (data.type === 'restart') {
            initGuest();
        }
    }
}

// Start networking
setupMultiplayer();
