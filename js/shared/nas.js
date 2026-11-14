/* ============================================================
   NAS sync (window.ScuLaNas)
   ------------------------------------------------------------
   A folder on the person's own NAS as the place the pages sync
   with, instead of a cloud account. Requirements, design and the
   reasons live in docs/tasks/nas-sync/.

   A page cannot speak SMB. The operating system connects to the
   share and the person chooses the folder with the browser's
   folder chooser; this script never asks for, parses out or keeps
   a password, and never makes a network request to the NAS.

   Loaded by the shared nav block of all eight pages, after
   ScuLaFolder, ScuLaCal and ScuLaGeo. It is a classic script so it
   keeps working from file://. Until an address is typed and a
   folder is chosen it only reads its own (empty) settings and
   shows the nav button - no prompt, no request, no change to a
   save.

   What is here so far: the nav button and its states, the
   settings sheet, the SMB address and default folder, and the
   "what this device can do" check. Choosing the folder, presence,
   the outbox and the sync passes come with later requirements.
   ============================================================ */
(function(){
  "use strict";

  var LANG_KEY = "scula:ui-lang";
  var DB_NAME = "scula-nas", DB_STORE = "config", ADDRESS_KEY = "address";
  var LS_KEY = "scula:nas:address";
  // A neutral example. No real address belongs in this file: the
  // repository has a public mirror (docs/tasks/nas-sync/00-overview.md).
  var EXAMPLE = "smb://user@192.168.1.10/share/folder/";
  var MAX_SEGMENTS = 24;

  var T = {
    ro:{
      label:"NAS",
      tipOff:"NAS: sincronizarea este oprită.",
      tipOffMore:" Apasă pentru setări.",
      tipAway:"NAS: nu ești acasă. Totul rămâne pe acest dispozitiv.",
      tipAwayWaiting:function(n){ return "NAS: nu ești acasă. " + filesRo(n) + " așteaptă."; },
      tipSync:"NAS: se sincronizează…",
      tipOk:function(when){ return when ? "NAS: sincronizat la " + when + "." : "NAS: sincronizat."; },
      tipAsk:"NAS: e nevoie de un clic ca să redeschizi dosarul.",
      tipError:function(m){ return "NAS: eroare." + (m ? " " + m : ""); },
      title:"Sincronizare cu NAS-ul",
      intro:"Un dosar de pe NAS-ul de acasă, în locul unui cont în cloud. O pagină web nu poate deschide singură o adresă smb://: sistemul se conectează la NAS, iar aici alegi dosarul o singură dată. Aplicația nu cere și nu păstrează nicio parolă.",
      soon:"Alegerea dosarului și sincronizarea nu sunt încă în această versiune. Deocamdată poți pregăti adresa și verifica dispozitivul.",
      addrLabel:"Adresa NAS-ului (SMB)",
      folderLabel:"Dosarul implicit de la acea adresă",
      folderHint:"Opțional: dosarul pe care îl vei alege pentru sincronizare.",
      save:"Păstrează adresa",
      saved:"Adresa a fost păstrată pe acest dispozitiv.",
      cleared:"Adresa a fost ștearsă de pe acest dispozitiv.",
      passwordDropped:"Parola din adresă nu a fost păstrată. Aplicația nu are nevoie de ea: o cere sistemul, când se conectează.",
      storeFailed:"Adresa nu a putut fi păstrată pe acest dispozitiv.",
      errScheme:"Adresa trebuie să înceapă cu smb:// — de exemplu " + EXAMPLE,
      errHost:"Numele sau adresa IP a NAS-ului nu este validă.",
      errPort:"Portul din adresă nu este valid.",
      errUser:"Numele de utilizator conține caractere nepermise.",
      errShare:"Lipsește numele partajării, cel de după adresa NAS-ului.",
      errPath:"Calea conține un nume de dosar nepermis.",
      errFolder:"Dosarul implicit conține un nume nepermis.",
      yourNas:"NAS-ul tău",
      openLink:"Deschide în managerul de fișiere",
      chooseThis:function(p){ return "Dosarul de ales: " + p; },
      howTitle:"Cum ajunge dosarul în fereastra de alegere",
      linux:function(a){ return "Linux: în managerul de fișiere alege „Alte locații” sau „Rețea”, apoi „Conectare la server”, și scrie " + a.shareUrl + " — sau, într-un terminal: gio mount \"" + a.shareUrl + "\". Partajarea apare apoi în bara laterală a ferestrei de alegere."; },
      windows:function(a){ return "Windows: în File Explorer alege „Acest PC”, apoi „Mapare unitate de rețea”, și scrie " + a.unc + "."; },
      mac:function(a){ return "macOS: în Finder alege „Accesare”, apoi „Conectare la server” (⌘K), și scrie " + a.shareUrl + "."; },
      android:function(a){ return "Android: instalează o aplicație care adaugă partajările SMB în fereastra de fișiere a sistemului (un „furnizor de stocare” SMB/CIFS) și adaugă serverul " + a.host + ", partajarea " + a.share + (a.user ? ", utilizatorul " + a.user : "") + ". Partajarea apare apoi în meniul lateral al ferestrei de alegere."; },
      diagTitle:"Ce poate face acest dispozitiv",
      pickerYes:"Browserul poate alege un dosar: sincronizarea cu NAS-ul poate funcționa aici.",
      pickerNo:"Browserul acesta nu are fereastră de alegere a unui dosar, deci nu poate ajunge la un dosar de pe NAS. Folosește Chrome sau Edge.",
      secureYes:"Pagina este deschisă de la o adresă sigură.",
      secureNo:"Pagina nu este deschisă de la o adresă sigură (https:// sau localhost). Browserul oprește aici alegerea dosarului și stocarea de durată.",
      persistYes:"Browserul a promis că nu șterge singur datele acestei pagini.",
      persistNo:"Browserul poate șterge datele acestei pagini când dispozitivul rămâne fără spațiu — inclusiv fișierele care așteaptă drumul spre NAS.",
      persistUnknown:"Browserul acesta nu spune dacă păstrează datele paginii.",
      persistAsk:"Cere păstrarea datelor",
      persistRefused:"Browserul a refuzat deocamdată. De obicei acceptă după ce pagina este folosită mai des sau instalată.",
      free:function(free, quota){ return "Spațiu liber pentru fișierele care așteaptă: aproximativ " + free + " din " + quota + "."; },
      freeUnknown:"Browserul acesta nu spune cât spațiu are pagina.",
      origin:function(o){ return "Adresa acestei pagini: " + o + ". Datele tale și dosarul ales țin de această adresă — deschide aplicația mereu de aici."; },
      originFile:"Pagina este deschisă direct de pe disc (file://). Datele tale și dosarul ales țin de acest mod de deschidere.",
      close:"Închide"
    },
    en:{
      label:"NAS",
      tipOff:"NAS: sync is off.",
      tipOffMore:" Click for settings.",
      tipAway:"NAS: you are not at home. Everything stays on this device.",
      tipAwayWaiting:function(n){ return "NAS: you are not at home. " + n + (n === 1 ? " file is waiting." : " files are waiting."); },
      tipSync:"NAS: syncing…",
      tipOk:function(when){ return when ? "NAS: in step at " + when + "." : "NAS: in step."; },
      tipAsk:"NAS: one click is needed to reopen the folder.",
      tipError:function(m){ return "NAS: error." + (m ? " " + m : ""); },
      title:"Sync with your NAS",
      intro:"A folder on your home NAS instead of a cloud account. A web page cannot open an smb:// address by itself: your system connects to the NAS, and you choose the folder here once. The app never asks for or keeps a password.",
      soon:"Choosing the folder and syncing are not in this version yet. For now you can prepare the address and check the device.",
      addrLabel:"NAS address (SMB)",
      folderLabel:"Default folder at that address",
      folderHint:"Optional: the folder you will choose for syncing.",
      save:"Keep the address",
      saved:"The address is kept on this device.",
      cleared:"The address was removed from this device.",
      passwordDropped:"The password in the address was not kept. The app does not need it: your system asks for it when it connects.",
      storeFailed:"The address could not be kept on this device.",
      errScheme:"The address has to start with smb:// — for example " + EXAMPLE,
      errHost:"The NAS name or IP address is not valid.",
      errPort:"The port in the address is not valid.",
      errUser:"The user name contains characters that are not allowed.",
      errShare:"The share name is missing — the part after the NAS address.",
      errPath:"The path contains a folder name that is not allowed.",
      errFolder:"The default folder contains a name that is not allowed.",
      yourNas:"Your NAS",
      openLink:"Open in the file manager",
      chooseThis:function(p){ return "Folder to choose: " + p; },
      howTitle:"How the folder gets into the folder chooser",
      linux:function(a){ return "Linux: in the file manager choose “Other locations” or “Network”, then “Connect to server”, and type " + a.shareUrl + " — or, in a terminal: gio mount \"" + a.shareUrl + "\". The share then appears in the sidebar of the folder chooser."; },
      windows:function(a){ return "Windows: in File Explorer choose “This PC”, then “Map network drive”, and type " + a.unc + "."; },
      mac:function(a){ return "macOS: in Finder choose “Go”, then “Connect to Server” (⌘K), and type " + a.shareUrl + "."; },
      android:function(a){ return "Android: install an app that adds SMB shares to the system file chooser (an SMB/CIFS “storage provider”) and add the server " + a.host + ", the share " + a.share + (a.user ? ", the user " + a.user : "") + ". The share then appears in the side menu of the folder chooser."; },
      diagTitle:"What this device can do",
      pickerYes:"This browser can choose a folder: NAS sync can work here.",
      pickerNo:"This browser has no folder chooser, so it cannot reach a folder on the NAS. Use Chrome or Edge.",
      secureYes:"The page is open from a secure address.",
      secureNo:"The page is not open from a secure address (https:// or localhost). The browser switches off the folder chooser and durable storage here.",
      persistYes:"The browser has promised not to clear this page's data on its own.",
      persistNo:"The browser may clear this page's data when the device runs low on space — including files waiting to go to the NAS.",
      persistUnknown:"This browser does not say whether it keeps the page's data.",
      persistAsk:"Ask to keep the data",
      persistRefused:"The browser refused for now. It usually agrees once the page is used more often or installed.",
      free:function(free, quota){ return "Free space for waiting files: about " + free + " of " + quota + "."; },
      freeUnknown:"This browser does not say how much space the page has.",
      origin:function(o){ return "This page's address: " + o + ". Your data and the chosen folder belong to this address — always open the app from here."; },
      originFile:"The page is open straight from disk (file://). Your data and the chosen folder belong to this way of opening it.",
      close:"Close"
    }
  };

  // Romanian counts: 1 fișier, 2 fișiere, 20 de fișiere.
  function filesRo(n){
    if(n === 1) return "1 fișier";
    var tail = n % 100;
    return n + (n === 0 || (tail > 0 && tail < 20) ? " fișiere" : " de fișiere");
  }

  var lang = "ro";
  try{ lang = localStorage.getItem(LANG_KEY) || "ro"; }catch(e){}
  function tx(k){ return (T[lang] || T.ro)[k]; }

  /* ---- the address: smb://[user@]host[:port]/share[/path] ---- */

  // One folder or share name. The rules of safePath() in transfer.html and
  // of the `directories` option of ScuLaFolder.save(): nothing that could
  // climb out of, or be misread inside, the folder it is appended to.
  function safeName(s){
    return typeof s === "string" && s.length > 0 && s.length <= 255 &&
      s !== "." && s !== ".." && !/[\\/\x00-\x1f\x7f<>:"|?*]/.test(s) && !/[. ]$/.test(s);
  }
  function decode(s){ try{ return decodeURIComponent(s); }catch(e){ return null; } }

  // Resolves a typed address to { ok:true, ... } or { ok:false, error:key }.
  // A password is recognised only to be thrown away: `hadPassword` tells the
  // caller to say so, and nothing returned here contains it.
  function parseAddress(text){
    var s = String(text == null ? "" : text).trim();
    // A Windows path (\\host\share\dir) means the same thing; accept it.
    if(/^\\\\[^\\]/.test(s)) s = "smb://" + s.slice(2).replace(/\\/g, "/");
    var m = /^smb:\/\/([^/?#]*)(\/[^?#]*)?$/i.exec(s);
    if(!m) return { ok:false, error:"errScheme" };

    var authority = m[1], user = "", hadPassword = false;
    var at = authority.lastIndexOf("@");
    if(at >= 0){
      var info = authority.slice(0, at);
      authority = authority.slice(at + 1);
      var colon = info.indexOf(":");
      if(colon >= 0){ hadPassword = true; info = info.slice(0, colon); }
      user = decode(info);
      if(user === null || /[\x00-\x20\x7f/@:?#\\]/.test(user) || user.length > 128) return { ok:false, error:"errUser" };
    }

    var host = authority, port = "";
    var pm = /^(\[[0-9a-fA-F:.]+\]|[^:]*):(\d*)$/.exec(authority);
    if(pm){
      host = pm[1]; port = pm[2];
      if(!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535) return { ok:false, error:"errPort" };
    }
    var ipv6 = /^\[[0-9a-fA-F:.]+\]$/.test(host) && host.indexOf(":") > 0;
    var name = /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(host);
    if(!ipv6 && !name) return { ok:false, error:"errHost" };
    host = host.toLowerCase();

    var parts = (m[2] || "").split("/").filter(function(p){ return p !== ""; }).map(decode);
    if(!parts.length) return { ok:false, error:"errShare" };
    if(parts.length > MAX_SEGMENTS || !parts.every(safeName)) return { ok:false, error:"errPath" };

    var share = parts[0], path = parts.slice(1);
    var where = host + (port ? ":" + port : "");
    var who = user ? encodeURIComponent(user).replace(/%3B/gi, ";") + "@" : "";
    return {
      ok:true, user:user, host:host, port:port, share:share, path:path, hadPassword:hadPassword,
      // What is kept and shown: the address as typed, minus any password.
      url:"smb://" + who + where + "/" + parts.map(encodeURIComponent).join("/") + "/",
      // What a system mounts: the share itself, without the folders inside it.
      shareUrl:"smb://" + who + where + "/" + encodeURIComponent(share) + "/",
      unc:"\\\\" + host + "\\" + share
    };
  }

  // The default folder: a relative path under the address, "" for none.
  function parseFolder(text){
    var parts = String(text == null ? "" : text).trim().split(/[\\/]+/).filter(function(p){ return p !== ""; });
    if(parts.length > MAX_SEGMENTS || !parts.every(safeName)) return { ok:false, error:"errFolder" };
    return { ok:true, parts:parts, text:parts.join("/") };
  }

  /* ---- what is remembered: this device only ---- */

  var dbp = null;
  function db(){
    if(dbp) return dbp;
    dbp = new Promise(function(res, rej){
      var r;
      try{ r = indexedDB.open(DB_NAME, 1); }catch(e){ rej(e); return; }
      r.onupgradeneeded = function(){
        if(!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE);
      };
      r.onsuccess = function(){
        // A later version of this script may add stores; let it upgrade.
        r.result.onversionchange = function(){ r.result.close(); dbp = null; };
        res(r.result);
      };
      r.onerror = function(){ rej(r.error); };
      r.onblocked = function(){ rej(new Error("blocked")); };
    });
    dbp.catch(function(){ dbp = null; });
    return dbp;
  }
  function dbRun(mode, run){
    return db().then(function(d){
      return new Promise(function(res, rej){
        var t = d.transaction(DB_STORE, mode), q = run(t.objectStore(DB_STORE));
        t.oncomplete = function(){ res(q ? q.result : undefined); };
        t.onerror = t.onabort = function(){ rej(t.error); };
      });
    });
  }
  // The address and folder are two short strings, so localStorage can stand
  // in where IndexedDB is refused (some private windows). The folder handle
  // a later requirement adds has no such fallback, and will say so.
  function loadAddress(){
    return dbRun("readonly", function(s){ return s.get(ADDRESS_KEY); }).catch(function(){
      try{ return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }catch(e){ return null; }
    });
  }
  function storeAddress(value){
    return dbRun("readwrite", function(s){
      return value ? s.put(value, ADDRESS_KEY) : s.delete(ADDRESS_KEY);
    }).then(function(){
      try{ localStorage.removeItem(LS_KEY); }catch(e){}
      return true;
    }, function(){
      try{
        if(value) localStorage.setItem(LS_KEY, JSON.stringify(value)); else localStorage.removeItem(LS_KEY);
        return true;
      }catch(e){ return false; }
    });
  }

  var address = null;       // parseAddress() result, or null
  var folder = "";          // "a/b", or ""

  // Returns { ok, message } and never throws. An empty address forgets it.
  function setAddress(addrText, folderText){
    var typed = String(addrText == null ? "" : addrText).trim();
    if(!typed){
      return storeAddress(null).then(function(ok){
        if(ok){ address = null; folder = ""; }
        return { ok:ok, cleared:ok, message:tx(ok ? "cleared" : "storeFailed") };
      });
    }
    var a = parseAddress(typed);
    if(!a.ok) return Promise.resolve({ ok:false, field:"address", message:tx(a.error) });
    var f = parseFolder(folderText);
    if(!f.ok) return Promise.resolve({ ok:false, field:"folder", message:tx(f.error) });
    return storeAddress({ url:a.url, folder:f.text }).then(function(ok){
      if(!ok) return { ok:false, message:tx("storeFailed") };
      address = a; folder = f.text;
      return { ok:true, hadPassword:a.hadPassword,
               message:(a.hadPassword ? tx("passwordDropped") + " " : "") + tx("saved") };
    });
  }

  var ready = loadAddress().then(function(v){
    var a = v && typeof v.url === "string" ? parseAddress(v.url) : null;
    var f = v && typeof v.folder === "string" ? parseFolder(v.folder) : null;
    // What was stored is read back through the same validation as what is typed.
    if(a && a.ok){ address = a; folder = f && f.ok ? f.text : ""; }
  }).catch(function(){}).then(function(){ paintButton(); });

  /* ---- the nav button ---- */

  var navBtn = document.getElementById("navNasBtn");
  // state: "off" | "away" | "sync" | "ok" | "ask" | "error"
  var status = { state:"off", waiting:0, at:0, error:"" };
  var MARK = { off:"", away:" ◌", sync:" ↻", ok:" ✓", ask:" ⚠", error:" ✕" };

  function clock(ms){
    if(!ms) return "";
    var d = new Date(ms);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function statusText(){
    switch(status.state){
      case "away": return status.waiting > 0 ? tx("tipAwayWaiting")(status.waiting) : tx("tipAway");
      case "sync": return tx("tipSync");
      case "ok": return tx("tipOk")(clock(status.at));
      case "ask": return tx("tipAsk");
      case "error": return tx("tipError")(status.error);
      default: return tx("tipOff");
    }
  }
  function paintButton(){
    if(!navBtn) return;
    navBtn.hidden = false;
    navBtn.className = status.state;
    navBtn.textContent = tx("label") + (MARK[status.state] || "") +
      (status.state === "away" && status.waiting > 0 ? " " + status.waiting : "");
    // Only the button invites a click; inside the sheet the same sentence
    // stands without it.
    var tip = statusText() + (status.state === "off" ? tx("tipOffMore") : "");
    navBtn.title = tip;
    navBtn.setAttribute("aria-label", tip);
  }
  // Presence and the sync passes (later requirements) report through this.
  function setStatus(next){
    var known = { off:1, away:1, sync:1, ok:1, ask:1, error:1 };
    status = {
      state: next && known[next.state] ? next.state : "off",
      waiting: next && next.waiting > 0 ? Math.floor(next.waiting) : 0,
      at: next && next.at > 0 ? +next.at : 0,
      error: next && typeof next.error === "string" ? next.error : ""
    };
    paintButton();
    if(sheet && sheet.classList.contains("open")) render();
  }

  /* ---- what this device can do ---- */

  // Facts only; nothing here contacts the NAS or opens a prompt.
  function diagnose(){
    var st = navigator.storage;
    var persisted = st && typeof st.persisted === "function"
      ? st.persisted().catch(function(){ return null; }) : Promise.resolve(null);
    var estimate = st && typeof st.estimate === "function"
      ? st.estimate().catch(function(){ return null; }) : Promise.resolve(null);
    return Promise.all([persisted, estimate]).then(function(v){
      var e = v[1], sized = e && e.quota > 0;
      return {
        picker: typeof window.showDirectoryPicker === "function",
        secure: window.isSecureContext === true,
        persisted: v[0] === true ? true : v[0] === false ? false : null,
        canPersist: !!(st && typeof st.persist === "function"),
        quota: sized ? e.quota : null,
        free: sized ? Math.max(0, e.quota - (e.usage || 0)) : null,
        origin: location.protocol === "file:" ? "file://" : location.origin
      };
    });
  }
  function bytes(n){
    var units = ["B", "KB", "MB", "GB", "TB"], i = 0;
    while(n >= 1024 && i < units.length - 1){ n /= 1024; i++; }
    var shown = n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
    return String(shown).replace(".", lang === "ro" ? "," : ".") + " " + units[i];
  }

  /* ---- the sheet ---- */

  var sheet = null, card = null, opener = null;
  var draft = null;         // { address, folder } typed but not kept yet
  var notice = null;        // { text, bad } shown under the form
  var persistNote = "";

  var CSS = [
    "#scula-nas{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;",
    "background:rgba(0,0,0,.55);padding:16px;font-family:system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;}",
    "#scula-nas.open{display:flex;}",
    "#scula-nas .card{width:min(480px,100%);background:#14201A;color:#F3EEE1;border:1px solid #2E4739;",
    "border-radius:14px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-height:calc(100vh - 32px);",
    "max-height:calc(100dvh - 32px);overflow-y:auto;box-sizing:border-box;text-align:left;}",
    "#scula-nas h2{margin:0 0 6px;font-size:16px;color:#F3EEE1;}",
    "#scula-nas h3{margin:18px 0 8px;font-size:13px;letter-spacing:.04em;color:#C1BB45;}",
    "#scula-nas p{margin:0 0 12px;font-size:13px;line-height:1.5;color:#9FB3A5;}",
    "#scula-nas .state{color:#F3EEE1;}",
    "#scula-nas label{display:block;margin:10px 0 4px;font-size:12px;color:#9FB3A5;}",
    "#scula-nas input{display:block;width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;",
    "background:#0E1712;color:#F3EEE1;border:1px solid #2E4739;border-radius:10px;font:inherit;font-size:16px;}",
    "#scula-nas input:focus-visible,#scula-nas button:focus-visible,#scula-nas a:focus-visible,",
    "#scula-nas summary:focus-visible{outline:2px solid #C1BB45;outline-offset:2px;}",
    "#scula-nas input[aria-invalid=true]{border-color:#C1BB45;}",
    "#scula-nas small{display:block;margin-top:4px;font-size:12px;color:#9FB3A5;}",
    "#scula-nas .act{display:block;width:100%;margin-top:12px;min-height:44px;padding:10px 14px;",
    "background:#C1BB45;color:#1A2117;border:0;border-radius:999px;font:inherit;font-weight:600;cursor:pointer;}",
    "#scula-nas .act.quiet{background:transparent;color:#F3EEE1;border:1px solid #2E4739;font-weight:400;}",
    "#scula-nas .msg{margin:10px 0 0;min-height:1.5em;color:#F3EEE1;}",
    "#scula-nas .msg.bad{color:#C1BB45;}",
    "#scula-nas a{color:#C1BB45;word-break:break-all;}",
    "#scula-nas .link{display:flex;align-items:center;min-height:44px;}",
    "#scula-nas ul{margin:0 0 12px;padding:0;list-style:none;}",
    "#scula-nas li{position:relative;margin:0 0 8px;padding-left:22px;font-size:13px;line-height:1.5;",
    "color:#9FB3A5;word-break:break-word;}",
    "#scula-nas li::before{position:absolute;left:0;top:0;color:#9FB3A5;content:\"•\";}",
    "#scula-nas li.yes::before{content:\"✓\";color:#C1BB45;}",
    "#scula-nas li.no::before{content:\"✕\";color:#F3EEE1;}",
    "#scula-nas li.no{color:#F3EEE1;}",
    "#scula-nas details{margin:0 0 12px;}",
    "#scula-nas summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:13px;color:#F3EEE1;}",
    "#scula-nas .close{display:block;width:100%;background:transparent;color:#9FB3A5;border:0;padding:12px;",
    "margin-top:4px;font:inherit;cursor:pointer;min-height:44px;}"
  ].join("");

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    return n;
  }

  function build(){
    var style = document.createElement("style");
    style.id = "scula-nas-style";
    style.textContent = CSS;
    document.head.appendChild(style);

    sheet = el("div");
    sheet.id = "scula-nas";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "nasTitle");
    sheet.addEventListener("click", function(ev){ if(ev.target === sheet) close(); });
    // Keys typed here are for this sheet: a page's own shortcuts must not
    // fire on a letter of the address. (Escape is taken earlier, below.)
    sheet.addEventListener("keydown", function(ev){ ev.stopPropagation(); });
    document.body.appendChild(sheet);
  }

  function field(id, label, value, placeholder, hint){
    var wrap = el("div");
    var l = el("label", "", label);
    l.htmlFor = id;
    var i = el("input");
    i.id = id; i.type = "text"; i.value = value; i.placeholder = placeholder;
    i.autocomplete = "off"; i.spellcheck = false;
    i.setAttribute("autocapitalize", "none");
    i.setAttribute("autocorrect", "off");
    wrap.appendChild(l); wrap.appendChild(i);
    if(hint){
      var h = el("small", "", hint);
      h.id = id + "Hint";
      i.setAttribute("aria-describedby", h.id);
      wrap.appendChild(h);
    }
    return wrap;
  }

  function render(){
    if(!sheet) return;
    var keep = document.activeElement && sheet.contains(document.activeElement) ? document.activeElement.id : "";
    card = el("div", "card");

    var h = el("h2", "", tx("title"));
    h.id = "nasTitle";
    card.appendChild(h);
    card.appendChild(el("p", "", tx("intro")));
    var st = el("p", "state", statusText());
    st.id = "nasState";
    card.appendChild(st);
    card.appendChild(el("p", "", tx("soon")));

    var form = el("form");
    form.noValidate = true;
    form.appendChild(field("nasAddr", tx("addrLabel"),
      draft ? draft.address : (address ? address.url : ""), EXAMPLE));
    form.appendChild(field("nasFolder", tx("folderLabel"),
      draft ? draft.folder : folder, "ScuLa", tx("folderHint")));
    var save = el("button", "act", tx("save"));
    save.id = "nasSave"; save.type = "submit";
    form.appendChild(save);
    var msg = el("p", "msg" + (notice && notice.bad ? " bad" : ""), notice ? notice.text : "");
    msg.id = "nasMsg";
    msg.setAttribute("role", "status");
    form.appendChild(msg);
    form.addEventListener("input", function(){
      draft = { address:form.querySelector("#nasAddr").value, folder:form.querySelector("#nasFolder").value };
    });
    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      var a = form.querySelector("#nasAddr").value, f = form.querySelector("#nasFolder").value;
      setAddress(a, f).then(function(r){
        notice = { text:r.message, bad:!r.ok, field:r.field || "" };
        // Kept: show what was stored (the password, if any, is gone from the
        // box too). Refused: leave what was typed for correcting.
        draft = r.ok ? null : { address:a, folder:f };
        render();
        var again = sheet.querySelector(r.field === "folder" ? "#nasFolder" : "#nasAddr");
        if(!r.ok && again) again.focus();
      });
    });
    card.appendChild(form);

    if(address) card.appendChild(mine());

    var dh = el("h3", "", tx("diagTitle"));
    card.appendChild(dh);
    var list = el("ul");
    list.id = "nasDiag";
    card.appendChild(list);
    var extra = el("div");
    card.appendChild(extra);

    var c = el("button", "close", tx("close"));
    c.id = "nasClose"; c.type = "button";
    c.addEventListener("click", close);
    card.appendChild(c);

    sheet.textContent = "";
    sheet.appendChild(card);
    if(notice && notice.bad){
      var bad = sheet.querySelector(notice.field === "folder" ? "#nasFolder" : "#nasAddr");
      if(bad){ bad.setAttribute("aria-invalid", "true"); bad.setAttribute("aria-errormessage", "nasMsg"); }
    }
    if(keep){ var back = sheet.querySelector("#" + keep); if(back) back.focus(); }
    paintDiagnosis(list, extra, card);
  }

  // The remembered NAS: the address as a link the system file manager
  // opens, the folder to look for, and how each system makes it choosable.
  function mine(){
    var box = el("div");
    box.id = "nasMine";
    box.appendChild(el("h3", "", tx("yourNas")));
    var p = el("p", "link");
    var a = el("a", "", address.url);
    a.id = "nasLink";
    a.href = address.url;
    a.title = tx("openLink");
    a.setAttribute("aria-label", tx("openLink") + ": " + address.url);
    p.appendChild(a);
    box.appendChild(p);
    var where = [address.share].concat(address.path, folder ? folder.split("/") : []).join("/");
    var w = el("p", "", tx("chooseThis")(where));
    w.id = "nasWhere";
    box.appendChild(w);
    var d = el("details");
    d.id = "nasHow";
    d.appendChild(el("summary", "", tx("howTitle")));
    var ul = el("ul");
    ["linux", "windows", "mac", "android"].forEach(function(k){
      var li = el("li", "", tx(k)(address));
      li.setAttribute("data-os", k);
      ul.appendChild(li);
    });
    d.appendChild(ul);
    box.appendChild(d);
    return box;
  }

  function paintDiagnosis(list, extra, forCard){
    diagnose().then(function(d){
      if(card !== forCard) return;            // the sheet was repainted meanwhile
      function line(id, ok, text){
        var li = el("li", ok === true ? "yes" : ok === false ? "no" : "", text);
        li.setAttribute("data-check", id);
        list.appendChild(li);
      }
      line("picker", d.picker, tx(d.picker ? "pickerYes" : "pickerNo"));
      line("secure", d.secure, tx(d.secure ? "secureYes" : "secureNo"));
      line("persist", d.persisted, tx(d.persisted === true ? "persistYes" : d.persisted === false ? "persistNo" : "persistUnknown"));
      line("space", null, d.free === null ? tx("freeUnknown") : tx("free")(bytes(d.free), bytes(d.quota)));
      line("origin", null, d.origin === "file://" ? tx("originFile") : tx("origin")(d.origin));
      if(d.persisted === false && d.canPersist){
        var b = el("button", "act quiet", tx("persistAsk"));
        b.id = "nasPersist"; b.type = "button";
        b.addEventListener("click", function(){
          navigator.storage.persist().catch(function(){ return false; }).then(function(ok){
            persistNote = ok ? "" : tx("persistRefused");
            render();
            var again = sheet.querySelector("#nasPersist") || sheet.querySelector("#nasClose");
            if(again) again.focus();
          });
        });
        extra.appendChild(b);
      }
      if(persistNote && d.persisted !== true){
        var n = el("p", "msg", persistNote);
        n.id = "nasPersistMsg";
        n.setAttribute("role", "status");
        extra.appendChild(n);
      }
    });
  }

  function open(){
    if(!sheet) build();
    opener = document.activeElement;
    draft = null; notice = null; persistNote = "";
    render();
    sheet.classList.add("open");
    var first = sheet.querySelector("#nasAddr");
    if(first) first.focus();
  }
  function close(){
    if(!sheet || !sheet.classList.contains("open")) return;
    sheet.classList.remove("open");
    if(opener && typeof opener.focus === "function") opener.focus();
    opener = null;
  }

  // Escape closes the sheet wherever the focus happens to be.
  document.addEventListener("keydown", function(ev){
    if(ev.key === "Escape" && sheet && sheet.classList.contains("open")){
      ev.preventDefault(); ev.stopPropagation(); close();
    }
  }, true);

  window.addEventListener("scula-ui-lang", function(ev){
    if(!ev.detail || ev.detail === lang) return;
    lang = ev.detail;
    paintButton();
    // Messages were written in the old language; the facts are repainted.
    notice = null; persistNote = "";
    if(sheet && sheet.classList.contains("open")) render();
  });

  if(navBtn){
    paintButton();
    navBtn.addEventListener("click", open);
  }

  window.ScuLaNas = {
    ready: ready,
    open: open,
    close: close,
    status: function(){ return { state:status.state, waiting:status.waiting, at:status.at, error:status.error }; },
    address: function(){
      return address ? { url:address.url, host:address.host, share:address.share,
                         path:address.path.slice(), folder:folder } : null;
    },
    setAddress: setAddress,
    parseAddress: parseAddress,
    parseFolder: parseFolder,
    diagnose: diagnose,
    // Not for pages: presence and the sync passes report through it, and
    // the tests paint the states with it until those passes exist.
    _setStatus: setStatus
  };
})();
