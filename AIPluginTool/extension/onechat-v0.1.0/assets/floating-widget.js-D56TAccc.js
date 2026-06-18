(function(){const z="cia-floating-widget-host",k="ciaFloatingWidget",T=chrome.runtime.getURL("src/sidepanel/index.html?embedded=1");function X(){var e,r,l;const n=[document.querySelector("main"),document.querySelector("article"),document.querySelector('[role="main"]'),document.body].filter(Boolean);for(const t of n){const d=(e=t.innerText)==null?void 0:e.trim();if(d&&d.length>200)return d}return((l=(r=document.body)==null?void 0:r.innerText)==null?void 0:l.trim())??""}async function Y(){var r,l;let n=null,e=null;try{const t=await chrome.runtime.sendMessage({type:"CIA_CAPTURE_SCREENSHOT"});t!=null&&t.ok&&t.dataUrl?n=t.dataUrl:e=(t==null?void 0:t.error)??"Could not capture the visible tab."}catch(t){e=(t==null?void 0:t.message)??"Screenshot capture failed."}return{url:window.location.href,title:document.title,selection:(((l=(r=window.getSelection)==null?void 0:r.call(window))==null?void 0:l.toString().trim())??"").slice(0,8e3),excerpt:X().slice(0,8e3),screenshot:n,captureError:e,restricted:!1,capturedAt:n?Date.now():null}}function N(n,e){var l;const r=()=>{var t;(t=n.contentWindow)==null||t.postMessage({type:"CIA_PAGE_CAPTURE",context:e},"*")};if(n.src!=="about:blank")try{((l=n.contentDocument)==null?void 0:l.readyState)==="complete"?r():n.addEventListener("load",r,{once:!0})}catch{r()}}function B(){var A,E,P,S,v,_,I,L,R;const n=document.createElement("div");n.id=z,n.style.cssText=`
    position: fixed;
    inset: auto 0 0 auto;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;const e=n.attachShadow({mode:"open"}),r=document.createElement("style");r.textContent=W,e.appendChild(r);const l=chrome.runtime.getURL("icons/icon-128.png"),t=chrome.runtime.getURL("icons/icon-128.png"),d=document.createElement("button");d.type="button",d.className="cia-fw-bubble",d.title="Open CiA Assistant",d.setAttribute("aria-label","Open CiA Assistant"),chrome.runtime.getURL("icons/icon-128.png"),d.innerHTML=`
    <span class="cia-fw-bubble-glow" aria-hidden="true"></span>
    <img src="${l}" class="cia-fw-bubble-mark" aria-hidden="true" alt="" />
    <img src="${t}" class="cia-fw-bubble-mark-hover" aria-hidden="true" alt="" />
  `,e.appendChild(d);const s=document.createElement("section");s.className="cia-fw-panel",s.setAttribute("role","dialog"),s.setAttribute("aria-label","CiA Assistant"),s.innerHTML=`
    <header class="cia-fw-header" data-drag-handle>
      <div class="cia-fw-handle-grip" aria-hidden="true"></div>
      <div class="cia-fw-title">
        <img src="${l}" class="cia-fw-logo" aria-hidden="true" alt="" />
        <span class="cia-fw-brand-name"><span class="cia-fw-brand-one">One</span>Chat</span>
      </div>
      <div class="cia-fw-actions">
        <button type="button" class="cia-fw-icon-btn" data-action="capture" title="Capture visible page (screenshot + text)" aria-label="Capture visible page">👁</button>
        <button type="button" class="cia-fw-icon-btn" data-action="dock" title="Open in browser side panel">⇲</button>
        <button type="button" class="cia-fw-icon-btn" data-action="popout" title="Pop out into its own window" aria-label="Pop out">⤢</button>
        <button type="button" class="cia-fw-icon-btn" data-action="minimize" title="Minimize">—</button>
        <button type="button" class="cia-fw-icon-btn" data-action="close" title="Close">×</button>
      </div>
    </header>
    <iframe class="cia-fw-iframe" src="about:blank" title="CiA Assistant" loading="lazy"></iframe>
    <div class="cia-fw-resizer" aria-hidden="true"></div>
  `,e.appendChild(s),document.documentElement.appendChild(n);const b=s.querySelector(".cia-fw-iframe"),p=s.querySelector('[data-action="capture"]'),i=s.querySelector('[data-action="dock"]'),c=s.querySelector('[data-action="popout"]'),o=s.querySelector('[data-action="minimize"]'),u=s.querySelector('[data-action="close"]'),h=s.querySelector("[data-drag-handle]"),m=s.querySelector(".cia-fw-resizer"),f=H(n,d,s,b);o.addEventListener("click",()=>f.collapse()),u.addEventListener("click",()=>f.collapse());let w=null;(P=(E=(A=chrome.storage)==null?void 0:A.local)==null?void 0:E.get)==null||P.call(E,["firstRunSeen"],a=>{if(!(a!=null&&a.firstRunSeen)){d.classList.add("is-first-run");const g=document.createElement("div");g.className="cia-fw-tooltip",g.textContent="Click here to chat with the CiA Assistant",e.appendChild(g),w=()=>{var O,C,M;d.classList.remove("is-first-run"),g.remove(),(M=(C=(O=chrome.storage)==null?void 0:O.local)==null?void 0:C.set)==null||M.call(C,{firstRunSeen:!0}),w=null},setTimeout(()=>w==null?void 0:w(),12e3)}}),U(d,f,()=>{w==null||w(),f.expand()}),p.addEventListener("click",()=>{(async()=>{p.disabled=!0,p.classList.add("is-capturing"),f.getState().open||f.expand();const g=await Y();p.disabled=!1,p.classList.remove("is-capturing"),g.screenshot?(p.classList.add("has-shot"),p.title="Page captured — send a message to analyse it"):(p.classList.remove("has-shot"),p.title=g.captureError??"Capture failed"),N(b,g)})()}),i.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"CIA_OPEN_SIDE_PANEL"}).catch(()=>{}),f.collapse()}),c.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"CIA_OPEN_POPOUT"}).catch(()=>{}),f.collapse()}),D(s,h,f),q(s,m,f),chrome.runtime.sendMessage({type:"CIA_GET_PANEL_PRESENCE"},a=>{chrome.runtime.lastError||a!=null&&a.open&&f.setExternalPanelOpen(!0)});const y=a=>{p.style.display=a?"none":""};(_=(v=(S=chrome.storage)==null?void 0:S.local)==null?void 0:v.get)==null||_.call(v,["ciaPrivacyMode"],a=>y(!!(a!=null&&a.ciaPrivacyMode))),(R=(L=(I=chrome.storage)==null?void 0:I.onChanged)==null?void 0:L.addListener)==null||R.call(L,(a,g)=>{g==="local"&&a.ciaPrivacyMode&&y(!!a.ciaPrivacyMode.newValue)}),chrome.runtime.onMessage.addListener(a=>{var g;(a==null?void 0:a.type)==="CIA_PANEL_PRESENCE"?f.setExternalPanelOpen(!!a.open):(a==null?void 0:a.type)==="CIA_TOGGLE_WIDGET"?f.toggle():(a==null?void 0:a.type)==="CIA_PREFILL_FROM_SELECTION"&&(f.expand(),(g=b.contentWindow)==null||g.postMessage({type:"CIA_PREFILL_FROM_SELECTION",...a},"*"))}),window.addEventListener("message",a=>{if(a.source!==b.contentWindow)return;const g=a.data;!g||typeof g!="object"||(g.type==="CIA_PANEL_CLOSE"&&f.collapse(),g.type==="CIA_PANEL_DOCK"&&(chrome.runtime.sendMessage({type:"CIA_OPEN_SIDE_PANEL"}).catch(()=>{}),f.collapse()),g.type==="CIA_CAPTURE_CLEARED"&&(p.classList.remove("has-shot"),p.title="Capture visible page (screenshot + text)"))})}function H(n,e,r,l){let t={open:!1,visible:!0,externalPanelOpen:!1,x:null,y:null,width:380,height:560,bubbleX:null,bubbleY:null};const d=()=>{var i,c,o;(o=(c=(i=chrome.storage)==null?void 0:i.local)==null?void 0:c.get)==null||o.call(c,[k],u=>{const h=u==null?void 0:u[k];h&&(t={...t,x:h.x??t.x,y:h.y??t.y,width:h.width??t.width,height:h.height??t.height,bubbleX:h.bubbleX??t.bubbleX,bubbleY:h.bubbleY??t.bubbleY,open:!1,visible:!0}),b()})},s=()=>{var f,w,y;const{x:i,y:c,width:o,height:u,bubbleX:h,bubbleY:m}=t;(y=(w=(f=chrome.storage)==null?void 0:f.local)==null?void 0:w.set)==null||y.call(w,{[k]:{x:i,y:c,width:o,height:u,bubbleX:h,bubbleY:m}})},b=()=>{const i=t.open||!t.visible||t.externalPanelOpen;n.dataset.state=t.open?"open":t.visible?"collapsed":"hidden",r.classList.toggle("is-open",t.open),e.classList.toggle("is-hidden",i),e.style.pointerEvents=i?"none":"auto",r.style.pointerEvents=t.open?"auto":"none";const c=56;if(t.bubbleX!=null&&t.bubbleY!=null){const o=x(t.bubbleX,4,Math.max(window.innerWidth-c-4,4)),u=x(t.bubbleY,4,Math.max(window.innerHeight-c-4,4));e.style.left=`${o}px`,e.style.top=`${u}px`,e.style.right="auto",e.style.bottom="auto"}else e.style.left="",e.style.top="",e.style.right="",e.style.bottom="";if(t.open){const o=x(t.width,320,Math.min(window.innerWidth-24,720)),u=x(t.height,360,Math.min(window.innerHeight-24,900)),h=t.x??24,m=t.y??Math.max(Math.round((window.innerHeight-u)/2),24);r.style.width=`${o}px`,r.style.height=`${u}px`,r.style.left=`${x(h,8,window.innerWidth-o-8)}px`,r.style.top=`${x(m,8,window.innerHeight-u-8)}px`,l.src==="about:blank"&&(l.src=T)}},p={expand(){t={...t,open:!0,visible:!0},b(),s(),e.blur()},collapse(){t={...t,open:!1,visible:!0},b(),s()},toggle(){t.open?p.collapse():p.expand()},setRect({x:i,y:c,width:o,height:u}){t={...t,x:i??t.x,y:c??t.y,width:o??t.width,height:u??t.height},b()},setBubbleRect({x:i,y:c}){t={...t,bubbleX:i??t.bubbleX,bubbleY:c??t.bubbleY},b()},setExternalPanelOpen(i){t={...t,externalPanelOpen:!!i},b()},persist:s,getState:()=>({...t})};return d(),window.addEventListener("resize",b),p}function x(n,e,r){return Math.max(e,Math.min(r,n))}function D(n,e,r){let l=!1,t=0,d=0,s=0,b=0;e.addEventListener("pointerdown",i=>{if(i.target.closest(".cia-fw-icon-btn"))return;l=!0,e.setPointerCapture(i.pointerId),n.classList.add("is-dragging");const c=n.getBoundingClientRect();t=i.clientX,d=i.clientY,s=c.left,b=c.top,i.preventDefault()}),e.addEventListener("pointermove",i=>{if(!l)return;const c=i.clientX-t,o=i.clientY-d;r.setRect({x:s+c,y:b+o})});const p=i=>{if(l){l=!1,n.classList.remove("is-dragging");try{e.releasePointerCapture(i.pointerId)}catch{}r.persist()}};e.addEventListener("pointerup",p),e.addEventListener("pointercancel",p)}function U(n,e,r){let t=null,d=0,s=0,b=0,p=0,i=!1;n.addEventListener("pointerdown",o=>{if(o.button!==0)return;t=o.pointerId,i=!1;const u=n.getBoundingClientRect();d=o.clientX,s=o.clientY,b=u.left,p=u.top,n.setPointerCapture(o.pointerId),o.preventDefault()}),n.addEventListener("pointermove",o=>{if(o.pointerId!==t)return;const u=o.clientX-d,h=o.clientY-s;!i&&Math.hypot(u,h)<4||(i=!0,n.classList.add("is-dragging"),e.setBubbleRect({x:b+u,y:p+h}))});const c=o=>{if(o.pointerId!==t)return;const u=i;t=null,i=!1,n.classList.remove("is-dragging");try{n.releasePointerCapture(o.pointerId)}catch{}u?e.persist():r()};n.addEventListener("pointerup",c),n.addEventListener("pointercancel",c)}function q(n,e,r){let l=!1,t=0,d=0,s=0,b=0;e.addEventListener("pointerdown",i=>{l=!0,e.setPointerCapture(i.pointerId),n.classList.add("is-resizing");const c=n.getBoundingClientRect();t=c.width,d=c.height,s=i.clientX,b=i.clientY,i.preventDefault()}),e.addEventListener("pointermove",i=>{if(!l)return;const c=i.clientX-s,o=i.clientY-b;r.setRect({width:t+c,height:d+o})});const p=i=>{if(l){l=!1,n.classList.remove("is-resizing");try{e.releasePointerCapture(i.pointerId)}catch{}r.persist()}};e.addEventListener("pointerup",p),e.addEventListener("pointercancel",p)}const W=`
  :host {
    all: initial;
  }

  .cia-fw-bubble,
  .cia-fw-panel,
  .cia-fw-bubble * {
    font-family: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
    box-sizing: border-box;
  }

  /* Squircle bubble (soft rounded-square edges, like the Rovo app icon) */
  .cia-fw-bubble {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 56px;
    height: 56px;
    border-radius: 30%;
    border: none;
    padding: 0;
    cursor: pointer;
    background: white;
    color: white;
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.18),
      0 4px 10px rgba(26, 11, 46, 0.12);
    display: grid;
    place-items: center;
    transition: transform 200ms cubic-bezier(.4,1.4,.6,1), box-shadow 200ms ease, background 200ms ease, opacity 200ms ease;
    pointer-events: auto;
    z-index: 2;
  }

  .cia-fw-bubble:hover {
    background: black;
    transform: translateY(-3px) scale(1.05);
    box-shadow:
      0 16px 32px rgba(0, 0, 0, 0.45),
      0 6px 14px rgba(26, 11, 46, 0.22);
  }

  .cia-fw-bubble:active {
    transform: translateY(-1px) scale(0.97);
  }

  .cia-fw-bubble.is-dragging {
    cursor: grabbing;
    transition: none;
    transform: scale(1.08);
    box-shadow:
      0 20px 40px rgba(228, 0, 124, 0.5),
      0 8px 18px rgba(26, 11, 46, 0.28);
  }

  .cia-fw-bubble.is-hidden {
    opacity: 0;
    transform: translateY(8px) scale(0.6);
    pointer-events: none;
  }

  .cia-fw-bubble.is-first-run {
    animation: cia-fw-pulse 1.6s ease-in-out infinite;
  }

  @keyframes cia-fw-pulse {
    0%, 100% {
      box-shadow:
        0 12px 28px rgba(228, 0, 124, 0.35),
        0 4px 10px rgba(26, 11, 46, 0.18),
        0 0 0 0 rgba(228, 0, 124, 0.55);
    }
    50% {
      box-shadow:
        0 12px 28px rgba(228, 0, 124, 0.45),
        0 4px 10px rgba(26, 11, 46, 0.22),
        0 0 0 14px rgba(228, 0, 124, 0);
    }
  }

  .cia-fw-tooltip {
    position: fixed;
    right: 88px;
    bottom: 32px;
    max-width: 220px;
    padding: 10px 14px;
    background: #1f1235;
    color: white;
    font-size: 13px;
    line-height: 1.4;
    border-radius: 12px;
    box-shadow: 0 12px 28px rgba(26, 11, 46, 0.35);
    pointer-events: none;
    animation: cia-fw-tooltip-in 320ms ease 200ms both;
    z-index: 1;
  }

  .cia-fw-tooltip::after {
    content: "";
    position: absolute;
    right: -6px;
    bottom: 16px;
    width: 12px;
    height: 12px;
    background: #1f1235;
    transform: rotate(45deg);
    border-radius: 2px;
  }

  @keyframes cia-fw-tooltip-in {
    from { opacity: 0; transform: translateX(8px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .cia-fw-bubble-glow {
    position: absolute;
    inset: -3px;
    border-radius: 30%;
    background: radial-gradient(closest-side, rgba(228,0,124,0.18), transparent 72%);
    opacity: 0.7;
    filter: blur(2px);
    pointer-events: none;
  }

  .cia-fw-bubble-mark,
  .cia-fw-bubble-mark-hover {
    position: absolute;
    z-index: 1;
    width: 34px;
    height: 34px;
    object-fit: contain;
    display: block;
    transition: opacity 200ms ease;
  }

  .cia-fw-bubble-mark {
    opacity: 1;
  }

  .cia-fw-bubble-mark-hover {
    opacity: 0;
  }

  .cia-fw-bubble:hover .cia-fw-bubble-mark {
    opacity: 0;
  }

  .cia-fw-bubble:hover .cia-fw-bubble-mark-hover {
    opacity: 1;
  }

  .cia-fw-panel {
    position: fixed;
    width: 380px;
    height: 560px;
    border-radius: 18px;
    background: white;
    color: #1f1235;
    overflow: hidden;
    display: none;
    flex-direction: column;
    box-shadow:
      0 24px 60px rgba(26, 11, 46, 0.35),
      0 8px 20px rgba(26, 11, 46, 0.18),
      0 0 0 1px rgba(124, 58, 237, 0.12);
    transform-origin: top left;
    animation: cia-fw-pop 220ms cubic-bezier(.2,1,.4,1);
    pointer-events: none;
  }

  .cia-fw-panel.is-open {
    display: flex;
    pointer-events: auto;
  }

  @keyframes cia-fw-pop {
    from { opacity: 0; transform: translateX(-12px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }

  .cia-fw-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-bottom: 1px solid rgba(124, 58, 237, 0.14);
    background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(250, 247, 255, 0.85));
    cursor: grab;
    user-select: none;
  }

  .cia-fw-panel.is-dragging .cia-fw-header,
  .cia-fw-panel.is-dragging {
    cursor: grabbing;
  }

  .cia-fw-handle-grip {
    width: 28px;
    height: 4px;
    border-radius: 999px;
    background: rgba(124, 58, 237, 0.25);
  }

  .cia-fw-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .cia-fw-brand-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .cia-fw-brand-name {
    font-size: 15px;
    font-weight: 700;
    color: #1f1235;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cia-fw-brand-one {
    color: #f9bd1c;
  }

  .cia-fw-brand-sub {
    font-size: 10px;
    font-weight: 500;
    color: #6f5f82;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cia-fw-logo {
    width: 18px;
    height: 18px;
    border-radius: 7px;
    display: block;
    object-fit: contain;
    background: white;
    padding: 2px;
    flex-shrink: 0;
  }

  .cia-fw-actions {
    display: flex;
    gap: 4px;
  }

  .cia-fw-icon-btn {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #6b6285;
    font-size: 13px;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 120ms ease, color 120ms ease;
  }

  .cia-fw-icon-btn:hover {
    background: rgba(124, 58, 237, 0.1);
    color: #1f1235;
  }

  .cia-fw-icon-btn[data-action="capture"] {
    font-size: 14px;
  }

  .cia-fw-icon-btn[data-action="capture"].has-shot {
    background: rgba(34, 197, 94, 0.18);
    color: #15803d;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
  }

  .cia-fw-icon-btn[data-action="capture"].is-capturing {
    opacity: 0.65;
    cursor: wait;
  }

  .cia-fw-iframe {
    flex: 1;
    width: 100%;
    border: none;
    background: white;
  }

  .cia-fw-resizer {
    position: absolute;
    width: 18px;
    height: 18px;
    right: 0;
    bottom: 0;
    cursor: nwse-resize;
    background:
      linear-gradient(135deg,
        transparent 0%,
        transparent 40%,
        rgba(124, 58, 237, 0.4) 40%,
        rgba(124, 58, 237, 0.4) 50%,
        transparent 50%,
        transparent 65%,
        rgba(124, 58, 237, 0.4) 65%,
        rgba(124, 58, 237, 0.4) 75%,
        transparent 75%);
  }

  @media (max-width: 480px) {
    .cia-fw-panel {
      width: calc(100vw - 24px) !important;
      height: calc(100vh - 80px) !important;
      left: 12px !important;
      top: 12px !important;
    }
    .cia-fw-resizer {
      display: none;
    }
  }
`;if(window.top===window&&!document.getElementById(z))try{B(),console.info("[CiA] floating widget injected on",location.href)}catch(n){console.warn("[CiA] floating widget failed to init",n)}
})()
