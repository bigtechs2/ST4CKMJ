import { ARCADE_BASE_CSS } from '../../../utils/arcadeCss.js';
import createHtmlGameCommand from '../../../utils/htmlGameCommand.js';

const PONG_HTML = `<style>
${ARCADE_BASE_CSS}
.board{touch-action:none}.button{touch-action:none}
.move{min-width:72px;font-size:18px}
</style>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div>
          <div class="brand">MINIST4CK ARCADE</div>
          <div class="title">NEON PONG</div>
        </div>
        <div class="stats">
          <div><div class="label">YOU</div><div class="value" id="player">00</div></div>
          <div><div class="label">CPU</div><div class="value" id="cpu">00</div></div>
        </div>
      </div>
      <div class="main">
        <div class="board" id="board">
          <canvas id="game" width="560" height="300"></canvas>
          <div class="overlay" id="overlay">
            <div class="overlay-title" id="overTitle">NEON PONG</div>
            <div class="overlay-sub" id="overSub">FIRST TO 5 WINS</div>
            <button class="button primary" id="start" style="margin-top:15px">START</button>
          </div>
        </div>
        <div class="controls">
          <button class="button move" data-move="up">▲</button>
          <button class="button move" data-move="down">▼</button>
        </div>
        <div class="status">DRAG OR TAP TO MOVE YOUR PADDLE</div>
      </div>
    </div>
  </div>
  <script>
    const c=document.getElementById('game'),x=c.getContext('2d');
    const boardEl=document.getElementById('board'),overlay=document.getElementById('overlay');
    const playerEl=document.getElementById('player'),cpuEl=document.getElementById('cpu');
    let playerY=120,cpuY=120,ball,ps=0,cs=0,playing=false,last=0,move=0;
    function ui(){playerEl.textContent=String(ps).padStart(2,'0');cpuEl.textContent=String(cs).padStart(2,'0')}
    function serve(dir){ball={x:280,y:150,vx:dir*3.2,vy:(Math.random()*3)-1.5}}
    function reset(){playerY=120;cpuY=120;ps=0;cs=0;serve(Math.random()>.5?1:-1);playing=true;last=0;overlay.classList.add('hidden');ui()}
    function finish(won){playing=false;document.getElementById('overTitle').textContent=won?'YOU WIN':'CPU WINS';document.getElementById('overSub').textContent='SCORE '+ps+' × '+cs;document.getElementById('start').textContent='PLAY AGAIN';overlay.classList.remove('hidden')}
    function point(cpu){if(cpu)cs++;else ps++;ui();if(ps>=5||cs>=5)return finish(ps>=5);serve(cpu?-1:1)}
    function update(dt){
      playerY=Math.max(0,Math.min(240,playerY+move*4.5*dt));
      cpuY+=Math.max(-2.6,Math.min(2.6,ball.y-(cpuY+30)))*dt;
      cpuY=Math.max(0,Math.min(240,cpuY));
      ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
      if(ball.y<7){ball.y=7;ball.vy=Math.abs(ball.vy)}
      if(ball.y>293){ball.y=293;ball.vy=-Math.abs(ball.vy)}
      if(ball.vx<0&&ball.x<31&&ball.x>18&&ball.y>playerY&&ball.y<playerY+60){ball.x=31;ball.vx=Math.abs(ball.vx)*1.015;ball.vy+=(ball.y-(playerY+30))*.06}
      if(ball.vx>0&&ball.x>529&&ball.x<542&&ball.y>cpuY&&ball.y<cpuY+60){ball.x=529;ball.vx=-Math.abs(ball.vx)*1.015;ball.vy+=(ball.y-(cpuY+30))*.06}
      if(ball.x<-12)point(true);if(ball.x>572)point(false)
    }
    function draw(){
      x.fillStyle='#07131a';x.fillRect(0,0,560,300);
      x.setLineDash([8,10]);x.strokeStyle='rgba(255,255,255,.18)';
      x.beginPath();x.moveTo(280,0);x.lineTo(280,300);x.stroke();x.setLineDash([]);
      x.shadowBlur=12;x.shadowColor='#58d3ff';x.fillStyle='#e8f8ff';
      x.fillRect(18,playerY,10,60);
      x.shadowColor='#ff6ea8';x.fillRect(532,cpuY,10,60);
      x.shadowColor='#ffd166';x.beginPath();x.arc(ball.x,ball.y,7,0,Math.PI*2);x.fill();
      x.shadowBlur=0
    }
    function loop(t){
      if(!last)last=t;
      const dt=Math.min((t-last)/16.67,2);
      last=t;
      if(playing)update(dt);
      draw();
      requestAnimationFrame(loop)
    }
    function pointY(e){const rect=c.getBoundingClientRect();return(e.clientY-rect.top)*300/rect.height}
    let dragPointer=null;
    function releaseDrag(e){if(dragPointer===e.pointerId){dragPointer=null;if(boardEl.hasPointerCapture?.(e.pointerId))boardEl.releasePointerCapture(e.pointerId)}}
    boardEl.addEventListener('pointerdown',e=>{
      if(e.target.closest?.('#start'))return;
      e.preventDefault();e.stopPropagation();
      dragPointer=e.pointerId;
      if(boardEl.setPointerCapture)boardEl.setPointerCapture(e.pointerId);
      if(playing)playerY=Math.max(0,Math.min(240,pointY(e)-30))
    });
    boardEl.addEventListener('pointermove',e=>{
      if(playing&&dragPointer===e.pointerId){e.preventDefault();playerY=Math.max(0,Math.min(240,pointY(e)-30))}
    });
    boardEl.addEventListener('pointerup',releaseDrag);
    boardEl.addEventListener('pointercancel',releaseDrag);
    boardEl.addEventListener('lostpointercapture',()=>{dragPointer=null});
    document.querySelectorAll('[data-move]').forEach(b=>{
      const dir=b.dataset.move==='up'?-1:1;
      b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(b.setPointerCapture)b.setPointerCapture(e.pointerId);move=dir});
      const release=()=>{move=0};
      b.addEventListener('pointerup',release);
      b.addEventListener('pointercancel',release);
      b.addEventListener('lostpointercapture',release)
    });
    document.addEventListener('pointerup',()=>move=0);
    document.addEventListener('contextmenu',e=>{if(e.target.closest?.('button,canvas'))e.preventDefault()});
    document.getElementById('start').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();reset()});
    serve(1);ui();requestAnimationFrame(loop);
  </script>
</body>`;

export default createHtmlGameCommand({
  name: 'pong',
  aliases: ['richpong', 'neonpong'],
  emoji: '⌬',
  category: 'utility',
  description: 'Neon Pong vs CPU inside WhatsApp',
  html: PONG_HTML,
  submessageText: 'MINIST4CK NEON PONG',
  displayName: 'Neon Pong',
  permissions: {
    coin:    0,
    premium: false,
    group:   true,
    private: true
  }
});