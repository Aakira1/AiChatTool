import{g as V}from"./index.html-CnQsEgb8.js";import{r as $}from"./jszip.min-DO9OGmRN.js";function Z(e,t){for(var n=0;n<t.length;n++){const r=t[n];if(typeof r!="string"&&!Array.isArray(r)){for(const a in r)if(a!=="default"&&!(a in e)){const o=Object.getOwnPropertyDescriptor(r,a);o&&Object.defineProperty(e,a,o.get?o:{enumerable:!0,get:()=>r[a]})}}}return Object.freeze(Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}))}var _={};/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */var M=function(e,t){return M=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(n,r){n.__proto__=r}||function(n,r){for(var a in r)r.hasOwnProperty(a)&&(n[a]=r[a])},M(e,t)};function K(e,t){M(e,t);function n(){this.constructor=e}e.prototype=t===null?Object.create(t):(n.prototype=t.prototype,new n)}var C=function(){return C=Object.assign||function(t){for(var n,r=1,a=arguments.length;r<a;r++){n=arguments[r];for(var o in n)Object.prototype.hasOwnProperty.call(n,o)&&(t[o]=n[o])}return t},C.apply(this,arguments)};function Q(e,t){var n={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&t.indexOf(r)<0&&(n[r]=e[r]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var a=0,r=Object.getOwnPropertySymbols(e);a<r.length;a++)t.indexOf(r[a])<0&&Object.prototype.propertyIsEnumerable.call(e,r[a])&&(n[r[a]]=e[r[a]]);return n}function Y(e,t,n,r){var a=arguments.length,o=a<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,i;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")o=Reflect.decorate(e,t,n,r);else for(var u=e.length-1;u>=0;u--)(i=e[u])&&(o=(a<3?i(o):a>3?i(t,n,o):i(t,n))||o);return a>3&&o&&Object.defineProperty(t,n,o),o}function ee(e,t){return function(n,r){t(n,r,e)}}function te(e,t){if(typeof Reflect=="object"&&typeof Reflect.metadata=="function")return Reflect.metadata(e,t)}function ne(e,t,n,r){function a(o){return o instanceof n?o:new n(function(i){i(o)})}return new(n||(n=Promise))(function(o,i){function u(f){try{s(r.next(f))}catch(c){i(c)}}function m(f){try{s(r.throw(f))}catch(c){i(c)}}function s(f){f.done?o(f.value):a(f.value).then(u,m)}s((r=r.apply(e,t||[])).next())})}function re(e,t){var n={label:0,sent:function(){if(o[0]&1)throw o[1];return o[1]},trys:[],ops:[]},r,a,o,i;return i={next:u(0),throw:u(1),return:u(2)},typeof Symbol=="function"&&(i[Symbol.iterator]=function(){return this}),i;function u(s){return function(f){return m([s,f])}}function m(s){if(r)throw new TypeError("Generator is already executing.");for(;n;)try{if(r=1,a&&(o=s[0]&2?a.return:s[0]?a.throw||((o=a.return)&&o.call(a),0):a.next)&&!(o=o.call(a,s[1])).done)return o;switch(a=0,o&&(s=[s[0]&2,o.value]),s[0]){case 0:case 1:o=s;break;case 4:return n.label++,{value:s[1],done:!1};case 5:n.label++,a=s[1],s=[0];continue;case 7:s=n.ops.pop(),n.trys.pop();continue;default:if(o=n.trys,!(o=o.length>0&&o[o.length-1])&&(s[0]===6||s[0]===2)){n=0;continue}if(s[0]===3&&(!o||s[1]>o[0]&&s[1]<o[3])){n.label=s[1];break}if(s[0]===6&&n.label<o[1]){n.label=o[1],o=s;break}if(o&&n.label<o[2]){n.label=o[2],n.ops.push(s);break}o[2]&&n.ops.pop(),n.trys.pop();continue}s=t.call(e,n)}catch(f){s=[6,f],a=0}finally{r=o=0}if(s[0]&5)throw s[1];return{value:s[0]?s[1]:void 0,done:!0}}}function oe(e,t,n,r){r===void 0&&(r=n),e[r]=t[n]}function ae(e,t){for(var n in e)n!=="default"&&!t.hasOwnProperty(n)&&(t[n]=e[n])}function X(e){var t=typeof Symbol=="function"&&Symbol.iterator,n=t&&e[t],r=0;if(n)return n.call(e);if(e&&typeof e.length=="number")return{next:function(){return e&&r>=e.length&&(e=void 0),{value:e&&e[r++],done:!e}}};throw new TypeError(t?"Object is not iterable.":"Symbol.iterator is not defined.")}function G(e,t){var n=typeof Symbol=="function"&&e[Symbol.iterator];if(!n)return e;var r=n.call(e),a,o=[],i;try{for(;(t===void 0||t-- >0)&&!(a=r.next()).done;)o.push(a.value)}catch(u){i={error:u}}finally{try{a&&!a.done&&(n=r.return)&&n.call(r)}finally{if(i)throw i.error}}return o}function ie(){for(var e=[],t=0;t<arguments.length;t++)e=e.concat(G(arguments[t]));return e}function se(){for(var e=0,t=0,n=arguments.length;t<n;t++)e+=arguments[t].length;for(var r=Array(e),a=0,t=0;t<n;t++)for(var o=arguments[t],i=0,u=o.length;i<u;i++,a++)r[a]=o[i];return r}function D(e){return this instanceof D?(this.v=e,this):new D(e)}function le(e,t,n){if(!Symbol.asyncIterator)throw new TypeError("Symbol.asyncIterator is not defined.");var r=n.apply(e,t||[]),a,o=[];return a={},i("next"),i("throw"),i("return"),a[Symbol.asyncIterator]=function(){return this},a;function i(l){r[l]&&(a[l]=function(p){return new Promise(function(d,v){o.push([l,p,d,v])>1||u(l,p)})})}function u(l,p){try{m(r[l](p))}catch(d){c(o[0][3],d)}}function m(l){l.value instanceof D?Promise.resolve(l.value.v).then(s,f):c(o[0][2],l)}function s(l){u("next",l)}function f(l){u("throw",l)}function c(l,p){l(p),o.shift(),o.length&&u(o[0][0],o[0][1])}}function ue(e){var t,n;return t={},r("next"),r("throw",function(a){throw a}),r("return"),t[Symbol.iterator]=function(){return this},t;function r(a,o){t[a]=e[a]?function(i){return(n=!n)?{value:D(e[a](i)),done:a==="return"}:o?o(i):i}:o}}function ce(e){if(!Symbol.asyncIterator)throw new TypeError("Symbol.asyncIterator is not defined.");var t=e[Symbol.asyncIterator],n;return t?t.call(e):(e=typeof X=="function"?X(e):e[Symbol.iterator](),n={},r("next"),r("throw"),r("return"),n[Symbol.asyncIterator]=function(){return this},n);function r(o){n[o]=e[o]&&function(i){return new Promise(function(u,m){i=e[o](i),a(u,m,i.done,i.value)})}}function a(o,i,u,m){Promise.resolve(m).then(function(s){o({value:s,done:u})},i)}}function fe(e,t){return Object.defineProperty?Object.defineProperty(e,"raw",{value:t}):e.raw=t,e}function me(e){if(e&&e.__esModule)return e;var t={};if(e!=null)for(var n in e)Object.hasOwnProperty.call(e,n)&&(t[n]=e[n]);return t.default=e,t}function pe(e){return e&&e.__esModule?e:{default:e}}function de(e,t){if(!t.has(e))throw new TypeError("attempted to get private field on non-instance");return t.get(e)}function he(e,t,n){if(!t.has(e))throw new TypeError("attempted to set private field on non-instance");return t.set(e,n),n}const ye=Object.freeze(Object.defineProperty({__proto__:null,get __assign(){return C},__asyncDelegator:ue,__asyncGenerator:le,__asyncValues:ce,__await:D,__awaiter:ne,__classPrivateFieldGet:de,__classPrivateFieldSet:he,__createBinding:oe,__decorate:Y,__exportStar:ae,__extends:K,__generator:re,__importDefault:pe,__importStar:me,__makeTemplateObject:fe,__metadata:te,__param:ee,__read:G,__rest:Q,__spread:ie,__spreadArrays:se,__values:X},Symbol.toStringTag,{value:"Module"})),S=V(ye);var h={},w={},R={},y={},F;function ge(){return F||(F=1,Object.defineProperty(y,"__esModule",{value:!0}),y.documentTemplate=y.defaultMargins=void 0,y.defaultMargins={top:1440,right:1440,bottom:1440,left:1440,header:720,footer:720,gutter:0},y.documentTemplate=function(e,t,n,r){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:ns6="http://schemas.openxmlformats.org/schemaLibrary/2006/main"
  xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:ns8="http://schemas.openxmlformats.org/drawingml/2006/chartDrawing"
  xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  xmlns:ns11="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram"
  xmlns:ns13="urn:schemas-microsoft-com:office:excel"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:ns17="urn:schemas-microsoft-com:office:powerpoint"
  xmlns:odx="http://opendope.org/xpaths"
  xmlns:odc="http://opendope.org/conditions"
  xmlns:odq="http://opendope.org/questions"
  xmlns:odi="http://opendope.org/components"
  xmlns:odgm="http://opendope.org/SmartArt/DataHierarchy"
  xmlns:ns24="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"
  xmlns:ns25="http://schemas.openxmlformats.org/drawingml/2006/compatibility"
  xmlns:ns26="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas">
  <w:body>
    <w:altChunk r:id="htmlChunk" />
    <w:sectPr>
      <w:pgSz w:w="`+e+'" w:h="'+t+'" w:orient="'+n+`" />
      <w:pgMar w:top="`+r.top+`"
               w:right="`+r.right+`"
               w:bottom="`+r.bottom+`"
               w:left="`+r.left+`"
               w:header="`+r.header+`"
               w:footer="`+r.footer+`"
               w:gutter="`+r.gutter+`"/>
    </w:sectPr>
  </w:body>
</w:document>
`}),y}var b={},I;function ve(){return I||(I=1,Object.defineProperty(b,"__esModule",{value:!0}),b.mhtDocumentTemplate=void 0,b.mhtDocumentTemplate=function(e,t){return`MIME-Version: 1.0
Content-Type: multipart/related;
    type="text/html";
    boundary="----=mhtDocumentPart"


------=mhtDocumentPart
Content-Type: text/html;
    charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: file:///C:/fake/document.html

`+e+`

`+t+`

------=mhtDocumentPart--
`}),b}var x={},A;function _e(){return A||(A=1,Object.defineProperty(x,"__esModule",{value:!0}),x.mhtPartTemplate=void 0,x.mhtPartTemplate=function(e,t,n,r){return`------=mhtDocumentPart
Content-Type: `+e+`
Content-Transfer-Encoding: `+t+`
Content-Location: `+n+`

`+r+`
`}),x}var B;function z(){return B||(B=1,(function(e){Object.defineProperty(e,"__esModule",{value:!0});var t=S;t.__exportStar(ge(),e),t.__exportStar(ve(),e),t.__exportStar(_e(),e)})(R)),R}var E;function we(){if(E)return w;E=1,Object.defineProperty(w,"__esModule",{value:!0}),w.getMHTdocument=void 0;var e=z();function t(r){var a=n(r),o=a.imageContentParts.join(`
`);return r=a.htmlSource.replace(/\=/g,"=3D"),e.mhtDocumentTemplate(r,o)}w.getMHTdocument=t;function n(r){var a=[],o=/"data:(\w+\/\w+);(\w+),(\S+)"/g,i=function(u,m,s,f){var c=a.length,l=m.split("/")[1],p="file:///C:/fake/image"+c+"."+l;return a.push(e.mhtPartTemplate(m,s,p,f)),'"'+p+'"'};return/<img/g.test(r)?(r=r.replace(o,i),{htmlSource:r,imageContentParts:a}):{htmlSource:r,imageContentParts:a}}return w}var q={},T={},k;function be(){return k||(k=1,Object.defineProperty(T,"__esModule",{value:!0}),T.contentTypesXml=void 0,T.contentTypesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType=
    "application/vnd.openxmlformats-package.relationships+xml" />
  <Override PartName="/word/document.xml" ContentType=
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/afchunk.mht" ContentType="message/rfc822"/>
</Types>
`),T}var P={},N;function xe(){return N||(N=1,Object.defineProperty(P,"__esModule",{value:!0}),P.documentXmlRels=void 0,P.documentXmlRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk"
    Target="/word/afchunk.mht" Id="htmlChunk" />
</Relationships>
`),P}var O={},U;function Te(){return U||(U=1,Object.defineProperty(O,"__esModule",{value:!0}),O.relsXml=void 0,O.relsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship
      Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
      Target="/word/document.xml" Id="R09c83fafc067488e" />
</Relationships>
`),O}var L;function Pe(){return L||(L=1,(function(e){Object.defineProperty(e,"__esModule",{value:!0});var t=S;t.__exportStar(be(),e),t.__exportStar(xe(),e),t.__exportStar(Te(),e)})(q)),q}var g={},H;function Oe(){if(H)return g;H=1,Object.defineProperty(g,"__esModule",{value:!0});var e=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(o){return typeof o}:function(o){return o&&typeof Symbol=="function"&&o.constructor===Symbol&&o!==Symbol.prototype?"symbol":typeof o},t=typeof window<"u"&&typeof window.document<"u",n=(typeof self>"u"?"undefined":e(self))==="object"&&self.constructor&&self.constructor.name==="DedicatedWorkerGlobalScope",r=typeof process<"u"&&process.versions!=null&&process.versions.node!=null,a=function(){return typeof window<"u"&&window.name==="nodejs"||navigator.userAgent.includes("Node.js")||navigator.userAgent.includes("jsdom")};return g.isBrowser=t,g.isWebWorker=n,g.isNode=r,g.isJsDom=a,g}var J;function De(){if(J)return h;J=1,Object.defineProperty(h,"__esModule",{value:!0}),h.addFiles=h.generateDocument=void 0;var e=S,t=we(),n=Pe(),r=z(),a=Oe(),o={orientation:"portrait",margins:{}};function i(c,l){return e.__assign(e.__assign({},c),l)}function u(c){return e.__awaiter(this,void 0,void 0,function(){var l;return e.__generator(this,function(p){switch(p.label){case 0:return[4,c.generateAsync({type:"arraybuffer"})];case 1:return l=p.sent(),a.isBrowser?[2,new Blob([l],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"})]:[2,new Buffer(new Uint8Array(l))]}})})}h.generateDocument=u;function m(c){return a.isBrowser?new Blob([c]):new Buffer(c,"utf-8")}function s(c){var l=c.orientation,p=c.margins,d=i(r.defaultMargins,p),v=0,j=0;return l==="landscape"?(j=12240,v=15840):(v=12240,j=15840),r.documentTemplate(v,j,l,d)}function f(c,l,p){var d=i(o,p);return c.file("[Content_Types].xml",m(n.contentTypesXml),{createFolders:!1}),c.folder("_rels").file(".rels",m(n.relsXml),{createFolders:!1}),c.folder("word").file("document.xml",s(d),{createFolders:!1}).file("afchunk.mht",t.getMHTdocument(l),{createFolders:!1}).folder("_rels").file("document.xml.rels",m(n.documentXmlRels),{createFolders:!1})}return h.addFiles=f,h}var W;function Se(){if(W)return _;W=1,Object.defineProperty(_,"__esModule",{value:!0}),_.asBlob=void 0;var e=S,t=De(),n=$();function r(a,o){return o===void 0&&(o={}),e.__awaiter(this,void 0,void 0,function(){var i;return e.__generator(this,function(u){switch(u.label){case 0:return i=new n,t.addFiles(i,a,o),[4,t.generateDocument(i)];case 1:return[2,u.sent()]}})})}return _.asBlob=r,_}var je=Se();const Me=Z({__proto__:null},[je]);export{Me as i};
