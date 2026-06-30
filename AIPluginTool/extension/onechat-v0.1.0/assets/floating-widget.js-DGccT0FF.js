(function(){const Y="cia-floating-widget-host",A="ciaFloatingWidget",B=chrome.runtime.getURL("src/sidepanel/index.html?embedded=1");function W(){var a,s,u;const n=[document.querySelector("main"),document.querySelector("article"),document.querySelector('[role="main"]'),document.body].filter(Boolean);for(const t of n){const b=(a=t.innerText)==null?void 0:a.trim();if(b&&b.length>200)return b}return((u=(s=document.body)==null?void 0:s.innerText)==null?void 0:u.trim())??""}async function q(){var s,u;let n=null,a=null;try{const t=await chrome.runtime.sendMessage({type:"CIA_CAPTURE_SCREENSHOT"});t!=null&&t.ok&&t.dataUrl?n=t.dataUrl:a=(t==null?void 0:t.error)??"Could not capture the visible tab."}catch(t){a=(t==null?void 0:t.message)??"Screenshot capture failed."}return{url:window.location.href,title:document.title,selection:(((u=(s=window.getSelection)==null?void 0:s.call(window))==null?void 0:u.toString().trim())??"").slice(0,8e3),excerpt:W().slice(0,8e3),screenshot:n,captureError:a,restricted:!1,capturedAt:n?Date.now():null}}function G(n,a){var u;const s=()=>{var t;(t=n.contentWindow)==null||t.postMessage({type:"CIA_PAGE_CAPTURE",context:a},"*")};if(n.src!=="about:blank")try{((u=n.contentDocument)==null?void 0:u.readyState)==="complete"?s():n.addEventListener("load",s,{once:!0})}catch{s()}}function $(){var I,C,z,X,P,R,T,O,H;const n=document.createElement("div");n.id=Y,n.style.cssText=`
    position: fixed;
    inset: auto 0 0 auto;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;const a=n.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=K,a.appendChild(s);const u=`<svg class="cia-fw-logo-svg" viewBox="0 0 40 40" aria-hidden="true">
    <defs><linearGradient id="cia-fw-lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#e4007c"/>
    </linearGradient></defs>
    <circle class="cia-fw-ring" cx="20" cy="20" r="13.5" fill="none" stroke="url(#cia-fw-lg)" stroke-width="4"/>
    <path class="cia-fw-star" d="M20 10.5 L21.8 18.2 L29.5 20 L21.8 21.8 L20 29.5 L18.2 21.8 L10.5 20 L18.2 18.2 Z" fill="url(#cia-fw-lg)"/>
  </svg>`,t=document.createElement("button");t.type="button",t.className="cia-fw-bubble",t.title="Open OneChat",t.setAttribute("aria-label","Open OneChat"),t.innerHTML=`<span class="cia-fw-bubble-glow" aria-hidden="true"></span>${u}`,a.appendChild(t);const b=document.createElement("button");b.type="button",b.className="cia-fw-quick is-hidden",b.innerHTML='<span class="cia-fw-quick-icon" aria-hidden="true"></span>',a.appendChild(b);const e=document.createElement("button");e.type="button",e.className="cia-fw-dots",e.title="Open OneChat",e.setAttribute("aria-label","Open OneChat"),e.innerHTML="<span></span><span></span><span></span>",a.appendChild(e);const l=document.createElement("section");l.className="cia-fw-panel",l.setAttribute("role","dialog"),l.setAttribute("aria-label","OneChat"),l.innerHTML=`
    <header class="cia-fw-header" data-drag-handle>
      <div class="cia-fw-title">
        ${u}
        <span class="cia-fw-brand-name">OneChat</span>
      </div>
      <div class="cia-fw-actions">
        <button type="button" class="cia-fw-icon-btn" data-action="home" title="Home" aria-label="Home">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8.5V14h4.5v-4h3v4H14V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 8l7-6.5L15 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="cia-fw-icon-btn" data-action="capture" title="Capture page" aria-label="Capture visible page">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button type="button" class="cia-fw-icon-btn" data-action="dock" title="Side panel" aria-label="Open in side panel">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button type="button" class="cia-fw-icon-btn" data-action="popout" title="Pop out" aria-label="Pop out into its own window">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M9 1.5h5.5V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2L8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 9.5v3a2 2 0 01-2 2H3.5a2 2 0 01-2-2V6a2 2 0 012-2H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button type="button" class="cia-fw-icon-btn" data-action="minimize" title="Minimize" aria-label="Minimize">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    </header>
    <iframe class="cia-fw-iframe" src="about:blank" title="OneChat" loading="lazy"></iframe>
    <div class="cia-fw-resizer" aria-hidden="true"></div>
  `,a.appendChild(l),document.documentElement.appendChild(n);const h=l.querySelector(".cia-fw-iframe"),o=l.querySelector('[data-action="home"]'),c=l.querySelector('[data-action="capture"]'),r=l.querySelector('[data-action="dock"]'),f=l.querySelector('[data-action="popout"]'),w=l.querySelector('[data-action="minimize"]'),x=l.querySelector("[data-drag-handle]"),g=l.querySelector(".cia-fw-resizer"),d=j(n,t,l,h,b,e);let m=null;const y=i=>{m=(i==null?void 0:i.id)??null,b.dataset.appId=m??"",b.title=i?`Open ${i.label}`:"",b.querySelector(".cia-fw-quick-icon").textContent=(i==null?void 0:i.icon)??"",b.classList.toggle("has-app",!!i),d.refresh()};(z=(C=(I=chrome.storage)==null?void 0:I.local)==null?void 0:C.get)==null||z.call(C,["ciaPinnedApp"],i=>y(i==null?void 0:i.ciaPinnedApp)),b.addEventListener("click",()=>{var i,p,v;m&&((v=(p=(i=chrome.storage)==null?void 0:i.local)==null?void 0:p.set)==null||v.call(p,{ciaPendingApp:{id:m,at:Date.now()}}),d.expand())}),w.addEventListener("click",()=>d.collapse()),o.addEventListener("click",()=>{var i,p;(p=(i=h.contentWindow)==null?void 0:i.postMessage)==null||p.call(i,{type:"CIA_NAV_HOME"},"*")}),U(t,d,()=>{d.expand()}),c.addEventListener("click",()=>{(async()=>{c.disabled=!0,c.classList.add("is-capturing"),d.getState().open||d.expand();const p=await q();c.disabled=!1,c.classList.remove("is-capturing"),p.screenshot?(c.classList.add("has-shot"),c.title="Page captured — send a message to analyse it"):(c.classList.remove("has-shot"),c.title=p.captureError??"Capture failed"),G(h,p)})()}),r.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"CIA_OPEN_SIDE_PANEL"}).catch(()=>{}),d.collapse()}),f.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"CIA_OPEN_POPOUT"}).catch(()=>{}),d.collapse()}),F(l,x,d),V(l,g,d);const L=15e3;let S=null;const D=()=>{const i=d.getState();if(i.open||!i.visible||i.externalPanelOpen)return;const p=t.getBoundingClientRect(),v=p.left+p.width/2<window.innerWidth/2?"left":"right",N=Math.min(Math.max(p.top+p.height/2-22,8),window.innerHeight-52);e.dataset.dock=v,e.style.top=`${N}px`,e.style.left=v==="left"?"0px":"auto",e.style.right=v==="right"?"0px":"auto",t.dataset.dock=v,t.classList.add("is-docked"),setTimeout(()=>{const M=d.getState();!M.open&&M.visible&&!M.externalPanelOpen&&t.classList.contains("is-docked")&&e.classList.add("is-shown")},260)},k=()=>{t.classList.remove("is-docked"),e.classList.remove("is-shown"),clearTimeout(S),S=setTimeout(D,L)};t.addEventListener("pointerenter",k),t.addEventListener("pointerdown",k),l.addEventListener("pointerdown",k),w.addEventListener("click",k),e.addEventListener("pointerenter",k),e.addEventListener("click",()=>{k(),d.expand()}),k(),chrome.runtime.sendMessage({type:"CIA_GET_PANEL_PRESENCE"},i=>{chrome.runtime.lastError||i!=null&&i.open&&d.setExternalPanelOpen(!0)});const _=i=>{c.style.display=i?"none":""};(R=(P=(X=chrome.storage)==null?void 0:X.local)==null?void 0:P.get)==null||R.call(P,["ciaPrivacyMode"],i=>_(!!(i!=null&&i.ciaPrivacyMode))),(H=(O=(T=chrome.storage)==null?void 0:T.onChanged)==null?void 0:O.addListener)==null||H.call(O,(i,p)=>{p==="local"&&(i.ciaPrivacyMode&&_(!!i.ciaPrivacyMode.newValue),i.ciaPinnedApp&&y(i.ciaPinnedApp.newValue))}),chrome.runtime.onMessage.addListener(i=>{var p;(i==null?void 0:i.type)==="CIA_PANEL_PRESENCE"?d.setExternalPanelOpen(!!i.open):(i==null?void 0:i.type)==="CIA_TOGGLE_WIDGET"?d.toggle():(i==null?void 0:i.type)==="CIA_PREFILL_FROM_SELECTION"&&(d.expand(),(p=h.contentWindow)==null||p.postMessage({type:"CIA_PREFILL_FROM_SELECTION",...i},"*"))}),window.addEventListener("message",i=>{if(i.source!==h.contentWindow)return;const p=i.data;!p||typeof p!="object"||(p.type==="CIA_PANEL_CLOSE"&&d.collapse(),p.type==="CIA_PANEL_DOCK"&&(chrome.runtime.sendMessage({type:"CIA_OPEN_SIDE_PANEL"}).catch(()=>{}),d.collapse()),p.type==="CIA_CAPTURE_CLEARED"&&(c.classList.remove("has-shot"),c.title="Capture visible page (screenshot + text)"))})}function j(n,a,s,u,t,b){let e={open:!1,visible:!0,externalPanelOpen:!1,x:null,y:null,width:380,height:560,bubbleX:null,bubbleY:null};const l=()=>{var r,f,w;(w=(f=(r=chrome.storage)==null?void 0:r.local)==null?void 0:f.get)==null||w.call(f,[A],x=>{const g=x==null?void 0:x[A];g&&(e={...e,x:g.x??e.x,y:g.y??e.y,width:g.width??e.width,height:g.height??e.height,bubbleX:g.bubbleX??e.bubbleX,bubbleY:g.bubbleY??e.bubbleY,open:!1,visible:!0}),o()})},h=()=>{var m,y,L;const{x:r,y:f,width:w,height:x,bubbleX:g,bubbleY:d}=e;(L=(y=(m=chrome.storage)==null?void 0:m.local)==null?void 0:y.set)==null||L.call(y,{[A]:{x:r,y:f,width:w,height:x,bubbleX:g,bubbleY:d}})},o=()=>{const r=e.open&&!e.externalPanelOpen,f=e.open||!e.visible||e.externalPanelOpen;n.dataset.state=e.externalPanelOpen?"hidden":e.open?"open":e.visible?"collapsed":"hidden",s.classList.toggle("is-open",r),a.classList.toggle("is-hidden",f),a.style.pointerEvents=f?"none":"auto",s.style.pointerEvents=r?"auto":"none",f&&(a.classList.remove("is-docked"),b&&b.classList.remove("is-shown"));const w=56;let x=null,g=null;if(e.bubbleX!=null&&e.bubbleY!=null?(x=E(e.bubbleX,4,Math.max(window.innerWidth-w-4,4)),g=E(e.bubbleY,4,Math.max(window.innerHeight-w-4,4)),a.style.left=`${x}px`,a.style.top=`${g}px`,a.style.right="auto",a.style.bottom="auto"):(a.style.left="",a.style.top="",a.style.right="",a.style.bottom=""),t){const d=!f&&t.classList.contains("has-app");t.classList.toggle("is-hidden",!d),t.style.pointerEvents=d?"auto":"none",x!=null&&g!=null?(t.style.left=`${x+8}px`,t.style.top=`${g-44}px`,t.style.right="auto",t.style.bottom="auto"):(t.style.left="",t.style.top="",t.style.right="",t.style.bottom="")}if(r){const d=E(e.width,320,Math.min(window.innerWidth-24,720)),m=E(e.height,360,Math.min(window.innerHeight-24,900)),y=e.x??24,L=e.y??Math.max(Math.round((window.innerHeight-m)/2),24);s.style.width=`${d}px`,s.style.height=`${m}px`,s.style.left=`${E(y,8,window.innerWidth-d-8)}px`,s.style.top=`${E(L,8,window.innerHeight-m-8)}px`,u.src==="about:blank"&&(u.src=B)}},c={expand(){e={...e,open:!0,visible:!0},o(),h(),a.blur()},collapse(){e={...e,open:!1,visible:!0},o(),h()},toggle(){e.open?c.collapse():c.expand()},setRect({x:r,y:f,width:w,height:x}){e={...e,x:r??e.x,y:f??e.y,width:w??e.width,height:x??e.height},o()},setBubbleRect({x:r,y:f}){e={...e,bubbleX:r??e.bubbleX,bubbleY:f??e.bubbleY},o()},setExternalPanelOpen(r){e={...e,externalPanelOpen:!!r},o()},persist:h,refresh:o,getState:()=>({...e})};return l(),window.addEventListener("resize",o),c}function E(n,a,s){return Math.max(a,Math.min(s,n))}function F(n,a,s){let u=!1,t=0,b=0,e=0,l=0;a.addEventListener("pointerdown",o=>{if(o.target.closest(".cia-fw-icon-btn"))return;u=!0,a.setPointerCapture(o.pointerId),n.classList.add("is-dragging");const c=n.getBoundingClientRect();t=o.clientX,b=o.clientY,e=c.left,l=c.top,o.preventDefault()}),a.addEventListener("pointermove",o=>{if(!u)return;const c=o.clientX-t,r=o.clientY-b;s.setRect({x:e+c,y:l+r})});const h=o=>{if(u){u=!1,n.classList.remove("is-dragging");try{a.releasePointerCapture(o.pointerId)}catch{}s.persist()}};a.addEventListener("pointerup",h),a.addEventListener("pointercancel",h)}function U(n,a,s){let t=null,b=0,e=0,l=0,h=0,o=!1;n.addEventListener("pointerdown",r=>{if(r.button!==0)return;t=r.pointerId,o=!1;const f=n.getBoundingClientRect();b=r.clientX,e=r.clientY,l=f.left,h=f.top,n.setPointerCapture(r.pointerId),r.preventDefault()}),n.addEventListener("pointermove",r=>{if(r.pointerId!==t)return;const f=r.clientX-b,w=r.clientY-e;!o&&Math.hypot(f,w)<4||(o=!0,n.classList.add("is-dragging"),a.setBubbleRect({x:l+f,y:h+w}))});const c=r=>{if(r.pointerId!==t)return;const f=o;t=null,o=!1,n.classList.remove("is-dragging");try{n.releasePointerCapture(r.pointerId)}catch{}f?a.persist():s()};n.addEventListener("pointerup",c),n.addEventListener("pointercancel",c)}function V(n,a,s){let u=!1,t=0,b=0,e=0,l=0;a.addEventListener("pointerdown",o=>{u=!0,a.setPointerCapture(o.pointerId),n.classList.add("is-resizing");const c=n.getBoundingClientRect();t=c.width,b=c.height,e=o.clientX,l=o.clientY,o.preventDefault()}),a.addEventListener("pointermove",o=>{if(!u)return;const c=o.clientX-e,r=o.clientY-l;s.setRect({width:t+c,height:b+r})});const h=o=>{if(u){u=!1,n.classList.remove("is-resizing");try{a.releasePointerCapture(o.pointerId)}catch{}s.persist()}};a.addEventListener("pointerup",h),a.addEventListener("pointercancel",h)}const K=`
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
    width: 46px;
    height: 46px;
    border-radius: 32%;
    padding: 0;
    cursor: pointer;
    color: white;
    /* Frosted-glass look */
    background: rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(12px) saturate(170%);
    -webkit-backdrop-filter: blur(12px) saturate(170%);
    border: 1px solid rgba(255, 255, 255, 0.45);
    box-shadow:
      0 10px 26px rgba(26, 11, 46, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
    display: grid;
    place-items: center;
    transition: transform 200ms cubic-bezier(.4,1.4,.6,1), box-shadow 200ms ease, background 200ms ease, opacity 200ms ease;
    pointer-events: auto;
    z-index: 2;
    /* Idle: a gentle breathing glow + bob while it's just sitting there. */
    animation: cia-fw-idle 4s ease-in-out infinite;
  }

  @keyframes cia-fw-idle {
    0%, 100% {
      transform: translateY(0) scale(1);
      box-shadow: 0 10px 26px rgba(26, 11, 46, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.55);
    }
    50% {
      transform: translateY(-3px) scale(1.015);
      box-shadow: 0 14px 30px rgba(124, 58, 237, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.62);
    }
  }

  .cia-fw-bubble:hover {
    animation: none;
    background: rgba(255, 255, 255, 0.28);
    transform: translateY(-3px) scale(1.06);
    box-shadow:
      0 16px 34px rgba(26, 11, 46, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }
  .cia-fw-bubble:active { animation: none; }
  .cia-fw-bubble.is-dragging { animation: none; }

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
    animation: none;
    opacity: 0;
    transform: translateY(8px) scale(0.6);
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .cia-fw-bubble { animation: none; }
    .cia-fw-bubble.is-docked { animation: none; opacity: 0; transform: scale(0.5); }
  }

  /* Collapsing: the bubble winds up, then zips toward the page edge and shrinks
     into the 3-dot tab. Hover/click on the tab restores it. */
  .cia-fw-bubble.is-docked {
    pointer-events: none;
    animation: cia-fw-zip-r 0.42s cubic-bezier(.5, -0.4, .7, 1) forwards;
  }
  .cia-fw-bubble.is-docked[data-dock="left"] {
    animation-name: cia-fw-zip-l;
  }
  @keyframes cia-fw-zip-r {
    0% { transform: translateX(0) scale(1); opacity: 1; }
    22% { transform: translateX(-6px) scale(1.1); opacity: 1; }
    100% { transform: translateX(42px) scale(0.32); opacity: 0; }
  }
  @keyframes cia-fw-zip-l {
    0% { transform: translateX(0) scale(1); opacity: 1; }
    22% { transform: translateX(6px) scale(1.1); opacity: 1; }
    100% { transform: translateX(-42px) scale(0.32); opacity: 0; }
  }

  .cia-fw-dots {
    position: fixed;
    width: 15px;
    height: 44px;
    padding: 0;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    z-index: 2;
    pointer-events: auto;
    /* Frosted-glass edge tab */
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 6px 16px rgba(26, 11, 46, 0.2);
    transition: width 160ms ease, background 160ms ease;
    animation: cia-fw-dots-in 200ms ease both;
  }
  .cia-fw-dots.is-shown { display: flex; }
  .cia-fw-dots[data-dock="left"] { border-radius: 0 12px 12px 0; }
  .cia-fw-dots[data-dock="right"] { border-radius: 12px 0 0 12px; }
  .cia-fw-dots:hover { width: 19px; background: rgba(255, 255, 255, 0.32); }
  .cia-fw-dots span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e4007c, #7c3aed);
  }
  @keyframes cia-fw-dots-in {
    from { opacity: 0; transform: translateX(var(--dx, 0)); }
    to { opacity: 1; transform: translateX(0); }
  }
  .cia-fw-dots[data-dock="left"] { --dx: -8px; }
  .cia-fw-dots[data-dock="right"] { --dx: 8px; }

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
    width: 28px;
    height: 28px;
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
    /* Frosted glass over the actual webpage behind the panel — light tint so
       the page reads through clearly. */
    background: rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(22px) saturate(165%);
    -webkit-backdrop-filter: blur(22px) saturate(165%);
    color: #1f1235;
    overflow: hidden;
    display: none;
    flex-direction: column;
    box-shadow:
      0 24px 60px rgba(26, 11, 46, 0.32),
      0 8px 20px rgba(26, 11, 46, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.6),
      0 0 0 1px rgba(255, 255, 255, 0.35);
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
    border-bottom: 1px solid rgba(255, 255, 255, 0.5);
    /* Apple-style frosted glass — steady white base + restrained saturation so
       it looks the same on every page, with a bright glass edge highlight. */
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(28px) saturate(135%);
    -webkit-backdrop-filter: blur(28px) saturate(135%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
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
    font-weight: 800;
    color: #7c3aed;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* O-with-star logo */
  .cia-fw-title .cia-fw-logo-svg { width: 18px; height: 18px; flex-shrink: 0; }
  .cia-fw-bubble .cia-fw-logo-svg { width: 28px; height: 28px; position: relative; z-index: 1; }

  /* Animated logo: twinkling star + gently pulsing ring */
  .cia-fw-star {
    transform-box: fill-box;
    transform-origin: center;
    animation: cia-fw-twinkle 2.6s ease-in-out infinite;
  }
  .cia-fw-ring {
    transform-box: fill-box;
    transform-origin: center;
    animation: cia-fw-ringpulse 2.6s ease-in-out infinite;
  }
  /* On bubble hover the star gives a quick spin */
  .cia-fw-bubble:hover .cia-fw-star { animation: cia-fw-starspin 0.8s cubic-bezier(.4,1.4,.6,1); }

  @keyframes cia-fw-twinkle {
    0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
    45% { transform: scale(1.22) rotate(16deg); opacity: 0.8; }
    70% { transform: scale(0.94) rotate(6deg); opacity: 1; }
  }
  @keyframes cia-fw-ringpulse {
    0%, 100% { transform: scale(1); opacity: 0.95; }
    50% { transform: scale(1.07); opacity: 1; }
  }
  @keyframes cia-fw-starspin {
    from { transform: scale(1) rotate(0deg); }
    to { transform: scale(1) rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .cia-fw-star, .cia-fw-ring { animation: none; }
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
    gap: 2px;
  }

  .cia-fw-icon-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #6b6285;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 120ms ease, color 120ms ease;
  }
  .cia-fw-icon-btn svg { display: block; }

  .cia-fw-icon-btn:hover {
    background: rgba(124, 58, 237, 0.1);
    color: #7c3aed;
  }

  .cia-fw-icon-btn[data-action="capture"].has-shot {
    background: rgba(34, 197, 94, 0.15);
    color: #15803d;
  }

  .cia-fw-icon-btn[data-action="capture"].is-capturing {
    opacity: 0.55;
    cursor: wait;
  }

  .cia-fw-iframe {
    flex: 1;
    width: 100%;
    border: none;
    /* Transparent so the panel's frosted-page backdrop shows through the app. */
    background: transparent;
    color-scheme: light;
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
`;if(window.top===window&&!document.getElementById(Y))try{$(),console.info("[OneChat] floating widget injected on",location.href)}catch(n){console.warn("[OneChat] floating widget failed to init",n)}
})()
