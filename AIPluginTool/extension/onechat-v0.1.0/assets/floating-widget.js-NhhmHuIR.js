(function(){const D="cia-floating-widget-host",_="ciaFloatingWidget",U=chrome.runtime.getURL("src/sidepanel/index.html?embedded=1");function q(){var i,s,d;const o=[document.querySelector("main"),document.querySelector("article"),document.querySelector('[role="main"]'),document.body].filter(Boolean);for(const n of o){const e=(i=n.innerText)==null?void 0:i.trim();if(e&&e.length>200)return e}return((d=(s=document.body)==null?void 0:s.innerText)==null?void 0:d.trim())??""}async function W(){var s,d;let o=null,i=null;try{const n=await chrome.runtime.sendMessage({type:"CIA_CAPTURE_SCREENSHOT"});n!=null&&n.ok&&n.dataUrl?o=n.dataUrl:i=(n==null?void 0:n.error)??"Could not capture the visible tab."}catch(n){i=(n==null?void 0:n.message)??"Screenshot capture failed."}return{url:window.location.href,title:document.title,selection:(((d=(s=window.getSelection)==null?void 0:s.call(window))==null?void 0:d.toString().trim())??"").slice(0,8e3),excerpt:q().slice(0,8e3),screenshot:o,captureError:i,restricted:!1,capturedAt:o?Date.now():null}}function $(o,i){var d;const s=()=>{var n;(n=o.contentWindow)==null||n.postMessage({type:"CIA_PAGE_CAPTURE",context:i},"*")};if(o.src!=="about:blank")try{((d=o.contentDocument)==null?void 0:d.readyState)==="complete"?s():o.addEventListener("load",s,{once:!0})}catch{s()}}function B(){var O,C,R,M,A,z,T,P,Y,X,k,N;const o=document.createElement("div");o.id=D,o.style.cssText=`
    position: fixed;
    inset: auto 0 0 auto;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;const i=o.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=V,i.appendChild(s);const d=chrome.runtime.getURL("icons/icon-128.png"),n=chrome.runtime.getURL("icons/icon-128.png"),e=document.createElement("button");e.type="button",e.className="cia-fw-bubble",e.title="Open CiA Assistant",e.setAttribute("aria-label","Open CiA Assistant"),chrome.runtime.getURL("icons/icon-128.png"),e.innerHTML=`
    <span class="cia-fw-bubble-glow" aria-hidden="true"></span>
    <img src="${d}" class="cia-fw-bubble-mark" aria-hidden="true" alt="" />
    <img src="${n}" class="cia-fw-bubble-mark-hover" aria-hidden="true" alt="" />
  `,i.appendChild(e);const f=document.createElement("button");f.type="button",f.className="cia-fw-quick is-hidden",f.innerHTML='<span class="cia-fw-quick-icon" aria-hidden="true"></span>',i.appendChild(f);const c=document.createElement("section");c.className="cia-fw-panel",c.setAttribute("role","dialog"),c.setAttribute("aria-label","CiA Assistant"),c.innerHTML=`
    <header class="cia-fw-header" data-drag-handle>
      <div class="cia-fw-handle-grip" aria-hidden="true"></div>
      <div class="cia-fw-title">
        <img src="${d}" class="cia-fw-logo" aria-hidden="true" alt="" />
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
  `,i.appendChild(c),document.documentElement.appendChild(o);const b=c.querySelector(".cia-fw-iframe"),a=c.querySelector('[data-action="capture"]'),l=c.querySelector('[data-action="dock"]'),r=c.querySelector('[data-action="popout"]'),h=c.querySelector('[data-action="minimize"]'),g=c.querySelector('[data-action="close"]'),w=c.querySelector("[data-drag-handle]"),m=c.querySelector(".cia-fw-resizer"),p=G(o,e,c,b,f);let x=null;const v=t=>{x=(t==null?void 0:t.id)??null,f.dataset.appId=x??"",f.title=t?`Open ${t.label}`:"",f.querySelector(".cia-fw-quick-icon").textContent=(t==null?void 0:t.icon)??"",f.classList.toggle("has-app",!!t),p.refresh()};(R=(C=(O=chrome.storage)==null?void 0:O.local)==null?void 0:C.get)==null||R.call(C,["ciaPinnedApp"],t=>v(t==null?void 0:t.ciaPinnedApp)),f.addEventListener("click",()=>{var t,u,L;x&&((L=(u=(t=chrome.storage)==null?void 0:t.local)==null?void 0:u.set)==null||L.call(u,{ciaPendingApp:{id:x,at:Date.now()}}),p.expand())}),h.addEventListener("click",()=>p.collapse()),g.addEventListener("click",()=>p.collapse());let y=null;(z=(A=(M=chrome.storage)==null?void 0:M.local)==null?void 0:A.get)==null||z.call(A,["firstRunSeen"],t=>{if(!(t!=null&&t.firstRunSeen)){e.classList.add("is-first-run");const u=document.createElement("div");u.className="cia-fw-tooltip",u.textContent="Click here to chat with the CiA Assistant",i.appendChild(u),y=()=>{var L,S,H;e.classList.remove("is-first-run"),u.remove(),(H=(S=(L=chrome.storage)==null?void 0:L.local)==null?void 0:S.set)==null||H.call(S,{firstRunSeen:!0}),y=null},setTimeout(()=>y==null?void 0:y(),12e3)}}),j(e,p,()=>{y==null||y(),p.expand()}),a.addEventListener("click",()=>{(async()=>{a.disabled=!0,a.classList.add("is-capturing"),p.getState().open||p.expand();const u=await W();a.disabled=!1,a.classList.remove("is-capturing"),u.screenshot?(a.classList.add("has-shot"),a.title="Page captured — send a message to analyse it"):(a.classList.remove("has-shot"),a.title=u.captureError??"Capture failed"),$(b,u)})()}),l.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"CIA_OPEN_SIDE_PANEL"}).catch(()=>{}),p.collapse()}),r.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"CIA_OPEN_POPOUT"}).catch(()=>{}),p.collapse()}),F(c,w,p),K(c,m,p),chrome.runtime.sendMessage({type:"CIA_GET_PANEL_PRESENCE"},t=>{chrome.runtime.lastError||t!=null&&t.open&&p.setExternalPanelOpen(!0)});const I=t=>{a.style.display=t?"none":""};(Y=(P=(T=chrome.storage)==null?void 0:T.local)==null?void 0:P.get)==null||Y.call(P,["ciaPrivacyMode"],t=>I(!!(t!=null&&t.ciaPrivacyMode))),(N=(k=(X=chrome.storage)==null?void 0:X.onChanged)==null?void 0:k.addListener)==null||N.call(k,(t,u)=>{u==="local"&&(t.ciaPrivacyMode&&I(!!t.ciaPrivacyMode.newValue),t.ciaPinnedApp&&v(t.ciaPinnedApp.newValue))}),chrome.runtime.onMessage.addListener(t=>{var u;(t==null?void 0:t.type)==="CIA_PANEL_PRESENCE"?p.setExternalPanelOpen(!!t.open):(t==null?void 0:t.type)==="CIA_TOGGLE_WIDGET"?p.toggle():(t==null?void 0:t.type)==="CIA_PREFILL_FROM_SELECTION"&&(p.expand(),(u=b.contentWindow)==null||u.postMessage({type:"CIA_PREFILL_FROM_SELECTION",...t},"*"))}),window.addEventListener("message",t=>{if(t.source!==b.contentWindow)return;const u=t.data;!u||typeof u!="object"||(u.type==="CIA_PANEL_CLOSE"&&p.collapse(),u.type==="CIA_PANEL_DOCK"&&(chrome.runtime.sendMessage({type:"CIA_OPEN_SIDE_PANEL"}).catch(()=>{}),p.collapse()),u.type==="CIA_CAPTURE_CLEARED"&&(a.classList.remove("has-shot"),a.title="Capture visible page (screenshot + text)"))})}function G(o,i,s,d,n){let e={open:!1,visible:!0,externalPanelOpen:!1,x:null,y:null,width:380,height:560,bubbleX:null,bubbleY:null};const f=()=>{var l,r,h;(h=(r=(l=chrome.storage)==null?void 0:l.local)==null?void 0:r.get)==null||h.call(r,[_],g=>{const w=g==null?void 0:g[_];w&&(e={...e,x:w.x??e.x,y:w.y??e.y,width:w.width??e.width,height:w.height??e.height,bubbleX:w.bubbleX??e.bubbleX,bubbleY:w.bubbleY??e.bubbleY,open:!1,visible:!0}),b()})},c=()=>{var p,x,v;const{x:l,y:r,width:h,height:g,bubbleX:w,bubbleY:m}=e;(v=(x=(p=chrome.storage)==null?void 0:p.local)==null?void 0:x.set)==null||v.call(x,{[_]:{x:l,y:r,width:h,height:g,bubbleX:w,bubbleY:m}})},b=()=>{const l=e.open&&!e.externalPanelOpen,r=e.open||!e.visible||e.externalPanelOpen;o.dataset.state=e.externalPanelOpen?"hidden":e.open?"open":e.visible?"collapsed":"hidden",s.classList.toggle("is-open",l),i.classList.toggle("is-hidden",r),i.style.pointerEvents=r?"none":"auto",s.style.pointerEvents=l?"auto":"none";const h=56;let g=null,w=null;if(e.bubbleX!=null&&e.bubbleY!=null?(g=E(e.bubbleX,4,Math.max(window.innerWidth-h-4,4)),w=E(e.bubbleY,4,Math.max(window.innerHeight-h-4,4)),i.style.left=`${g}px`,i.style.top=`${w}px`,i.style.right="auto",i.style.bottom="auto"):(i.style.left="",i.style.top="",i.style.right="",i.style.bottom=""),n){const m=!r&&n.classList.contains("has-app");n.classList.toggle("is-hidden",!m),n.style.pointerEvents=m?"auto":"none",g!=null&&w!=null?(n.style.left=`${g+8}px`,n.style.top=`${w-44}px`,n.style.right="auto",n.style.bottom="auto"):(n.style.left="",n.style.top="",n.style.right="",n.style.bottom="")}if(l){const m=E(e.width,320,Math.min(window.innerWidth-24,720)),p=E(e.height,360,Math.min(window.innerHeight-24,900)),x=e.x??24,v=e.y??Math.max(Math.round((window.innerHeight-p)/2),24);s.style.width=`${m}px`,s.style.height=`${p}px`,s.style.left=`${E(x,8,window.innerWidth-m-8)}px`,s.style.top=`${E(v,8,window.innerHeight-p-8)}px`,d.src==="about:blank"&&(d.src=U)}},a={expand(){e={...e,open:!0,visible:!0},b(),c(),i.blur()},collapse(){e={...e,open:!1,visible:!0},b(),c()},toggle(){e.open?a.collapse():a.expand()},setRect({x:l,y:r,width:h,height:g}){e={...e,x:l??e.x,y:r??e.y,width:h??e.width,height:g??e.height},b()},setBubbleRect({x:l,y:r}){e={...e,bubbleX:l??e.bubbleX,bubbleY:r??e.bubbleY},b()},setExternalPanelOpen(l){e={...e,externalPanelOpen:!!l},b()},persist:c,refresh:b,getState:()=>({...e})};return f(),window.addEventListener("resize",b),a}function E(o,i,s){return Math.max(i,Math.min(s,o))}function F(o,i,s){let d=!1,n=0,e=0,f=0,c=0;i.addEventListener("pointerdown",a=>{if(a.target.closest(".cia-fw-icon-btn"))return;d=!0,i.setPointerCapture(a.pointerId),o.classList.add("is-dragging");const l=o.getBoundingClientRect();n=a.clientX,e=a.clientY,f=l.left,c=l.top,a.preventDefault()}),i.addEventListener("pointermove",a=>{if(!d)return;const l=a.clientX-n,r=a.clientY-e;s.setRect({x:f+l,y:c+r})});const b=a=>{if(d){d=!1,o.classList.remove("is-dragging");try{i.releasePointerCapture(a.pointerId)}catch{}s.persist()}};i.addEventListener("pointerup",b),i.addEventListener("pointercancel",b)}function j(o,i,s){let n=null,e=0,f=0,c=0,b=0,a=!1;o.addEventListener("pointerdown",r=>{if(r.button!==0)return;n=r.pointerId,a=!1;const h=o.getBoundingClientRect();e=r.clientX,f=r.clientY,c=h.left,b=h.top,o.setPointerCapture(r.pointerId),r.preventDefault()}),o.addEventListener("pointermove",r=>{if(r.pointerId!==n)return;const h=r.clientX-e,g=r.clientY-f;!a&&Math.hypot(h,g)<4||(a=!0,o.classList.add("is-dragging"),i.setBubbleRect({x:c+h,y:b+g}))});const l=r=>{if(r.pointerId!==n)return;const h=a;n=null,a=!1,o.classList.remove("is-dragging");try{o.releasePointerCapture(r.pointerId)}catch{}h?i.persist():s()};o.addEventListener("pointerup",l),o.addEventListener("pointercancel",l)}function K(o,i,s){let d=!1,n=0,e=0,f=0,c=0;i.addEventListener("pointerdown",a=>{d=!0,i.setPointerCapture(a.pointerId),o.classList.add("is-resizing");const l=o.getBoundingClientRect();n=l.width,e=l.height,f=a.clientX,c=a.clientY,a.preventDefault()}),i.addEventListener("pointermove",a=>{if(!d)return;const l=a.clientX-f,r=a.clientY-c;s.setRect({width:n+l,height:e+r})});const b=a=>{if(d){d=!1,o.classList.remove("is-resizing");try{i.releasePointerCapture(a.pointerId)}catch{}s.persist()}};i.addEventListener("pointerup",b),i.addEventListener("pointercancel",b)}const V=`
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

  /* Pinned-app quick-launch button (floats just above the bubble) */
  .cia-fw-quick {
    position: fixed;
    right: 32px;
    bottom: 88px;
    width: 40px;
    height: 40px;
    border-radius: 28%;
    border: 2px solid #fff;
    padding: 0;
    cursor: pointer;
    background: linear-gradient(135deg, #7c3aed, #e4007c);
    box-shadow: 0 8px 18px rgba(124, 58, 237, 0.4);
    display: grid;
    place-items: center;
    transition: transform 180ms cubic-bezier(.4,1.4,.6,1), opacity 180ms ease, box-shadow 180ms ease;
    z-index: 2;
  }
  .cia-fw-quick:hover { transform: translateY(-2px) scale(1.08); box-shadow: 0 12px 24px rgba(124, 58, 237, 0.5); }
  .cia-fw-quick:active { transform: scale(0.94); }
  .cia-fw-quick.is-hidden { opacity: 0; transform: translateY(8px) scale(0.6); pointer-events: none; }
  .cia-fw-quick-icon { font-size: 18px; line-height: 1; }

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
`;if(window.top===window&&!document.getElementById(D))try{B(),console.info("[CiA] floating widget injected on",location.href)}catch(o){console.warn("[CiA] floating widget failed to init",o)}
})()
