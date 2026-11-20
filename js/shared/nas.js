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
   settings sheet, the noted SMB address of the sync folder and the
   steps that connect it on each system, the "what this device can
   do" check, choosing the NAS folder, presence
   (home or away), the outbox - the queue every saved file waits
   in until the device is home - and what a page's two-way pass is
   built on: the file store (list, read, write, move, copy by path,
   and an advisory lock), this device's own id and name, and pass(),
   which runs one only at home. The chapter pass itself is
   js/markdown/nassync.js; the calendar pass is here, because every
   page carries the calendar.
   ============================================================ */
(function(){
  "use strict";

  var LANG_KEY = "scula:ui-lang";
  var DB_NAME = "scula-nas", DB_STORE = "config", ADDRESS_KEY = "address";
  var OUTBOX = "outbox", BYTES = "bytes";
  var LS_KEY = "scula:nas:address";
  // A neutral example. No real address belongs in this file: the
  // repository has a public mirror (docs/tasks/nas-sync/00-overview.md).
  var EXAMPLE = "smb://user@192.168.1.10/share/folder/";
  var MAX_SEGMENTS = 24;
  // The phone's road. Chrome's folder chooser on Android is the system's
  // own, and it lists a NAS only when an app puts it there. This is the app
  // the steps name; any other SMB "storage provider" is used the same way.
  var SMB_APP = "CIFS Documents Provider";
  var SMB_APP_URL = "https://play.google.com/store/apps/details?id=com.wa2c.android.cifsdocumentsprovider";

  var T = {
    ro:{
      label:"NAS",
      tipOff:"NAS: sincronizarea este oprită.",
      tipOffMore:" Apasă pentru setări.",
      tipAway:"NAS: nu ești acasă. Totul rămâne pe acest dispozitiv.",
      tipAwayWaiting:function(n){ return "NAS: nu ești acasă. " + filesRo(n) + " așteaptă."; },
      tipHome:"NAS: ești acasă. Dosarul răspunde.",
      tipHomeWaiting:function(n){ return "NAS: ești acasă. " + filesRo(n) + " așteaptă încă."; },
      tipSync:"NAS: se sincronizează…",
      tipSyncWaiting:function(n){ return "NAS: se trimit fișierele. În așteptare: " + filesRo(n) + "."; },
      tipOk:function(when){ return when ? "NAS: sincronizat la " + when + "." : "NAS: sincronizat."; },
      tipAsk:"NAS: e nevoie de un clic ca să redeschizi dosarul.",
      tipError:function(m){ return "NAS: eroare." + (m ? " " + m : ""); },
      title:"Sincronizare cu NAS-ul",
      intro:"Un dosar de pe NAS-ul de acasă, în locul unui cont în cloud. Sistemul — pe telefon, o aplicație SMB — se conectează la NAS, iar aici alegi dosarul o singură dată. Aplicația nu cere și nu păstrează nicio parolă.",
      folderTitle:"Dosarul de sincronizare",
      folderNone:"Niciun dosar ales încă.",
      folderIs:function(n){ return "Dosar ales: " + n; },
      folderAt:function(u){ return "Pe NAS: " + u; },
      folderCode:function(c){ return "Codul dosarului: " + c + ". Același cod apare pe fiecare dispozitiv care sincronizează cu acest dosar; alt cod înseamnă alt dosar."; },
      mismatch:function(noted, chosen){ return "Adresa notată mai jos se termină în „" + noted + "”, dar dosarul ales pe acest dispozitiv se numește „" + chosen + "”. Sincronizarea folosește dosarul ales, nu adresa. Dacă „" + chosen + "” este dosarul bun, corectează adresa; dacă nu, alege alt dosar."; },
      fixAddr:"Corectează adresa",
      sameFolder:"Este același dosar, sub alt nume",
      sameKept:"Notat: adresa este a dosarului ales.",
      pick:"Alege dosarul de pe NAS",
      pickOther:"Alege alt dosar",
      forget:"Uită dosarul",
      grant:"Redeschide dosarul",
      release:"Eliberează-l ca 📁 și folosește-l pentru NAS",
      picked:function(n){ return "„" + n + "” este acum dosarul NAS. În el au fost create dosarele paginilor și un fișier de identitate."; },
      joined:function(n){ return "„" + n + "” era deja un dosar de sincronizare; acest dispozitiv i s-a alăturat. Nimic din el nu a fost schimbat."; },
      forgotten:"Dosarul a fost uitat pe acest dispozitiv. Pe NAS nu s-a schimbat nimic.",
      forgetFailed:"Dosarul nu a putut fi uitat: browserul a refuzat stocarea.",
      denied:"Browserul nu a primit acces de scriere în dosar.",
      clash:function(n){ return "„" + n + "” este deja dosarul 📁 în care ajung fișierele salvate. Același dosar nu poate fi și dosarul NAS: fișierele salvate nu ar mai rămâne și pe acest dispozitiv. Alege cu 📁 un dosar de pe acest dispozitiv, sau eliberează-l aici — fișierele salvate se descarcă atunci până alegi alt dosar 📁."; },
      badIdentity:"Dosarul are un fișier de identitate (.scula-sync.json) care nu poate fi citit. Nu a fost schimbat nimic: alege alt dosar sau repară fișierul.",
      newerIdentity:"Dosarul a fost pregătit de o versiune mai nouă a aplicației. Actualizează aplicația pe acest dispozitiv.",
      pickFailed:"Dosarul nu a putut fi pregătit: citirea sau scrierea în el a eșuat.",
      notKept:"Dosarul nu a putut fi ținut minte pe acest dispozitiv: browserul a refuzat stocarea.",
      whyGone:"Dosarul nu răspunde. Partajarea este conectată?",
      whyGoneAndroid:"Dosarul nu răspunde. Ești pe Wi-Fi-ul de acasă? Dacă da, deschide o dată aplicația SMB (" + SMB_APP + ") și apasă din nou butonul NAS.",
      whyOther:"Dosarul răspunde, dar nu mai poartă identitatea ținută minte aici. Alege-l din nou dacă este cel bun.",
      addrTitle:"Adresa dosarului pe NAS",
      addrLabel:"Adresa dosarului de sincronizare (opțional)",
      addrHint:"O notiță, nu o legătură: o pagină web nu poate deschide o adresă smb://, iar sincronizarea folosește numai dosarul ales mai sus. Scrie adresa întreagă, până la dosarul ales; pașii de conectare îi folosesc numele.",
      save:"Păstrează adresa",
      saved:"Adresa a fost păstrată pe acest dispozitiv.",
      savedOther:function(noted, chosen){ return "Adresa a fost păstrată, dar se termină în „" + noted + "”, iar dosarul ales se numește „" + chosen + "”. Vezi avertismentul de la „Dosarul de sincronizare”."; },
      savedPick:"Adresa a fost păstrată pe acest dispozitiv. Sincronizarea pornește abia după ce alegi dosarul cu butonul „Alege dosarul de pe NAS” de mai sus: adresa doar arată ce trebuie conectat.",
      cleared:"Adresa a fost ștearsă de pe acest dispozitiv.",
      passwordDropped:"Parola din adresă nu a fost păstrată. Aplicația nu are nevoie de ea: o cere sistemul, când se conectează.",
      storeFailed:"Adresa nu a putut fi păstrată pe acest dispozitiv.",
      errScheme:"Adresa trebuie să înceapă cu smb:// — de exemplu " + EXAMPLE,
      errHost:"Numele sau adresa IP a NAS-ului nu este validă.",
      errPort:"Portul din adresă nu este valid.",
      errUser:"Numele de utilizator conține caractere nepermise.",
      errShare:"Lipsește numele partajării, cel de după adresa NAS-ului.",
      errPath:"Calea conține un nume de dosar nepermis.",
      errFolder:"Dosarul conține un nume nepermis.",
      openLink:"Deschide în managerul de fișiere",
      howTitle:"Cum ajunge NAS-ul pe acest dispozitiv",
      howHere:function(os){ return "Pașii pentru acest dispozitiv (" + os + ")"; },
      howOther:"Pașii pentru alte sisteme",
      anyShare:"smb://NAS/partajare/",
      anyUnc:"\\\\NAS\\partajare",
      linux:function(a){ return "În GNOME, în Fișiere alege „Alte locații”, apoi „Conectare la server”, și scrie " + a.shareUrl + " — sau, într-un terminal: gio mount \"" + a.shareUrl + "\" (amândouă au nevoie de pachetul gvfs-smb). În KDE scrie " + a.shareUrl + " în bara de adresă din Dolphin. Partajarea apare apoi în bara laterală a ferestrei de alegere. În KDE dosarul ales așa primește altă cale la fiecare autentificare și trebuie ales din nou; o montare permanentă (cifs, vezi docs/NAS-SETUP.md) îl păstrează."; },
      windows:function(a){ return "În File Explorer alege „Acest PC”, apoi „Mapare unitate de rețea”, și scrie " + a.unc + "."; },
      mac:function(a){ return "În Finder alege „Accesare”, apoi „Conectare la server” (⌘K), și scrie " + a.shareUrl + "."; },
      deskPick:function(a, btn){ return "Apasă aici „" + btn + "” și alege " + (a.folder ? "dosarul " + a.inShare + " din partajarea " + a.share : a.generic ? "din partajare dosarul pe care îl vrei pentru sincronizare" : "partajarea " + a.share + " sau un dosar din ea") + ", apoi permite browserului să modifice fișierele din el."; },
      andApp:"Instalează aplicația „" + SMB_APP + "” (din Google Play sau F-Droid) și deschide-o. Ea face NAS-ul vizibil în fereastra de fișiere a telefonului; alt „furnizor de stocare” SMB/CIFS se folosește la fel.",
      andConn:function(a){ return a.generic
        ? "Adaugă în ea o conexiune: la Host numele sau adresa IP a NAS-ului, la User utilizatorul tău, iar la Folder partajarea (și, dacă vrei, un dosar din ea). Parola rămâne în aplicația aceea; pagina aceasta nu o vede. Lasă „Read only” oprit."
        : "Adaugă în ea o conexiune: la Host scrie " + a.host + (a.port ? ", la Port " + a.port : "") + (a.domain ? ", la Domain " + a.domain : "") + (a.login ? ", la User " + a.login : "") + ", iar la Folder " + a.above + ". Aplicația arată atunci adresa " + a.aboveUrl + ". Parola rămâne în aplicația aceea; pagina aceasta nu o vede. Lasă „Read only” oprit."; },
      andPick:function(a, btn){ return "Apasă aici „" + btn + "”. În fereastra de fișiere deschide meniul ☰, alege „" + SMB_APP + "”, apoi conexiunea ta, " + (a.folder ? "intră în dosarul " + a.folder : "intră în dosarul pe care îl vrei pentru sincronizare (îl poți crea acolo)") + " și apasă butonul de jos („Folosește acest dosar”), apoi „Permite”."; },
      andRule:"Dosarul de sincronizare este cel ales la ultimul pas. Conexiunea din aplicație doar îl face vizibil: poate arăta spre el sau spre orice dosar de deasupra lui.",
      andAwake:"Dacă acasă butonul rămâne ◌, deschide o dată " + SMB_APP + " și apasă din nou NAS: Android oprește aplicațiile nefolosite. În setările ei poți porni „Show notification when opening files”, care o ține pornită cât timp sunt folosite fișiere.",
      appLink:SMB_APP + " în Google Play",
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
      outTitle:"Fișiere care așteaptă drumul spre NAS",
      outNone:"Niciun fișier nu așteaptă.",
      outOff:"Sincronizarea este oprită. Fișierele de mai jos au rămas de dinainte; pleacă spre NAS după ce alegi din nou un dosar.",
      routeAlso:"Fișierele salvate ajung pe acest dispozitiv ca și până acum (în dosarul 📁, prin partajare sau descărcate), iar o copie așteaptă aici drumul spre NAS.",
      routeBtn:"Unde ajung fișierele salvate…",
      outTotal:function(n, size){ return filesRo(n) + ", " + size + " în total."; },
      outFree:function(free){ return " Spațiu liber pe dispozitiv: aproximativ " + free + "."; },
      outMore:function(n){ return "… și încă " + filesRo(n) + "."; },
      outWarn:"Spațiul de pe acest dispozitiv este aproape plin: fișierele care așteaptă nu mai au mult loc. Deschide aplicația acasă, ca să ajungă pe NAS, sau salvează-le altfel și elimină-le din listă.",
      outSave:"Salvează altfel",
      outRemove:"Elimină",
      outAsk:"Fișierul nu a ajuns încă pe NAS. Îl elimini din așteptare?",
      outYes:"Da, elimină",
      outNo:"Nu",
      outRemoved:function(n){ return "„" + n + "” a fost eliminat din așteptare."; },
      outSaveFailed:"Fișierul nu a putut fi salvat altfel.",
      outGone:"Fișierul nu mai este în așteptare.",
      errLost:"Fișierul nu mai este pe acest dispozitiv: browserul l-a șters.",
      errFull:"Ultima încercare a eșuat: pe NAS nu mai este loc.",
      errDenied:"Ultima încercare a eșuat: scrierea în dosar a fost refuzată.",
      errFailed:function(n){ return "Scrierea pe NAS a eșuat (" + (n === 1 ? "o încercare" : n + " încercări") + "). Se încearcă din nou mai târziu."; },
      copyFailed:function(n){ return "Fișierul a fost salvat ca de obicei, dar copia pentru NAS nu a putut fi păstrată: " + n; },
      calBad:"Fișierul calendarului de pe NAS (calendar/events.json) nu poate fi citit sau nu este valid. Nimic nu a fost schimbat.",
      calNewer:"Fișierul calendarului de pe NAS a fost scris de o versiune mai nouă a aplicației. Actualizează aplicația pe acest dispozitiv.",
      ageNow:"acum",
      ageMin:function(n){ return "acum " + n + " min"; },
      ageHours:function(n){ return "acum " + n + " h"; },
      ageDays:function(n){ return n === 1 ? "acum o zi" : "acum " + n + (n % 100 > 0 && n % 100 < 20 ? " zile" : " de zile"); },
      close:"Închide"
    },
    en:{
      label:"NAS",
      tipOff:"NAS: sync is off.",
      tipOffMore:" Click for settings.",
      tipAway:"NAS: you are not at home. Everything stays on this device.",
      tipAwayWaiting:function(n){ return "NAS: you are not at home. " + n + (n === 1 ? " file is waiting." : " files are waiting."); },
      tipHome:"NAS: you are at home. The folder answers.",
      tipHomeWaiting:function(n){ return "NAS: you are at home. " + filesEn(n) + (n === 1 ? " is" : " are") + " still waiting."; },
      tipSync:"NAS: syncing…",
      tipSyncWaiting:function(n){ return "NAS: delivering files. Still waiting: " + n + "."; },
      tipOk:function(when){ return when ? "NAS: in step at " + when + "." : "NAS: in step."; },
      tipAsk:"NAS: one click is needed to reopen the folder.",
      tipError:function(m){ return "NAS: error." + (m ? " " + m : ""); },
      title:"Sync with your NAS",
      intro:"A folder on your home NAS instead of a cloud account. Your system — on a phone, an SMB app — connects to the NAS, and you choose the folder here once. The app never asks for or keeps a password.",
      folderTitle:"The sync folder",
      folderNone:"No folder chosen yet.",
      folderIs:function(n){ return "Chosen folder: " + n; },
      folderAt:function(u){ return "On the NAS: " + u; },
      folderCode:function(c){ return "Folder code: " + c + ". Every device that syncs with this folder shows the same code; another code means another folder."; },
      mismatch:function(noted, chosen){ return "The address noted below ends in “" + noted + "”, but the folder chosen on this device is called “" + chosen + "”. Sync uses the chosen folder, not the address. If “" + chosen + "” is the right folder, correct the address; if not, choose another folder."; },
      fixAddr:"Correct the address",
      sameFolder:"It is the same folder, under another name",
      sameKept:"Noted: the address is the chosen folder's.",
      pick:"Choose the NAS folder",
      pickOther:"Choose another folder",
      forget:"Forget the folder",
      grant:"Reopen the folder",
      release:"Release it as 📁 and use it for the NAS",
      picked:function(n){ return "“" + n + "” is now the NAS folder. The page folders and an identity file were created in it."; },
      joined:function(n){ return "“" + n + "” was already a sync folder; this device has joined it. Nothing in it was changed."; },
      forgotten:"The folder was forgotten on this device. Nothing on the NAS was changed.",
      forgetFailed:"The folder could not be forgotten: the browser refused the storage.",
      denied:"The browser was not given write access to the folder.",
      clash:function(n){ return "“" + n + "” is already the 📁 folder that saved files go to. The same folder cannot also be the NAS folder: saved files would no longer also stay on this device. Choose a folder on this device with 📁, or release it here — saved files then download until you choose another 📁 folder."; },
      badIdentity:"The folder has an identity file (.scula-sync.json) that cannot be read. Nothing was changed: choose another folder or repair the file.",
      newerIdentity:"The folder was set up by a newer version of the app. Update the app on this device.",
      pickFailed:"The folder could not be set up: reading or writing in it failed.",
      notKept:"The folder could not be remembered on this device: the browser refused the storage.",
      whyGone:"The folder does not answer. Is the share connected?",
      whyGoneAndroid:"The folder does not answer. Are you on the home Wi-Fi? If so, open the SMB app (" + SMB_APP + ") once and press the NAS button again.",
      whyOther:"The folder answers, but it no longer carries the identity remembered here. Choose it again if it is the right one.",
      addrTitle:"The folder's address on the NAS",
      addrLabel:"Address of the sync folder (optional)",
      addrHint:"A note, not a connection: a web page cannot open an smb:// address, and sync uses only the folder chosen above. Type the whole address, down to the chosen folder; the connection steps use its names.",
      save:"Keep the address",
      saved:"The address is kept on this device.",
      savedOther:function(noted, chosen){ return "The address is kept, but it ends in “" + noted + "” and the chosen folder is called “" + chosen + "”. See the warning under “The sync folder”."; },
      savedPick:"The address is kept on this device. Sync starts only once you choose the folder with the “Choose the NAS folder” button above: the address only shows what to connect.",
      cleared:"The address was removed from this device.",
      passwordDropped:"The password in the address was not kept. The app does not need it: your system asks for it when it connects.",
      storeFailed:"The address could not be kept on this device.",
      errScheme:"The address has to start with smb:// — for example " + EXAMPLE,
      errHost:"The NAS name or IP address is not valid.",
      errPort:"The port in the address is not valid.",
      errUser:"The user name contains characters that are not allowed.",
      errShare:"The share name is missing — the part after the NAS address.",
      errPath:"The path contains a folder name that is not allowed.",
      errFolder:"The folder contains a name that is not allowed.",
      openLink:"Open in the file manager",
      howTitle:"How the NAS reaches this device",
      howHere:function(os){ return "Steps for this device (" + os + ")"; },
      howOther:"Steps for other systems",
      anyShare:"smb://NAS/share/",
      anyUnc:"\\\\NAS\\share",
      linux:function(a){ return "On GNOME, in Files choose “Other locations”, then “Connect to server”, and type " + a.shareUrl + " — or, in a terminal: gio mount \"" + a.shareUrl + "\" (both need the gvfs-smb package). On KDE type " + a.shareUrl + " in Dolphin's address bar. The share then appears in the sidebar of the folder chooser. On KDE a folder chosen this way gets a new path each time you log in and has to be chosen again; a permanent mount (cifs, see docs/NAS-SETUP.md) keeps it."; },
      windows:function(a){ return "In File Explorer choose “This PC”, then “Map network drive”, and type " + a.unc + "."; },
      mac:function(a){ return "In Finder choose “Go”, then “Connect to Server” (⌘K), and type " + a.shareUrl + "."; },
      deskPick:function(a, btn){ return "Press “" + btn + "” here and choose " + (a.folder ? "the folder " + a.inShare + " in the share " + a.share : a.generic ? "the folder in the share that you want to sync with" : "the share " + a.share + " or a folder in it") + ", then allow the browser to edit the files in it."; },
      andApp:"Install the app “" + SMB_APP + "” (from Google Play or F-Droid) and open it. It makes the NAS visible in the phone's file chooser; another SMB/CIFS “storage provider” is used the same way.",
      andConn:function(a){ return a.generic
        ? "Add a connection in it: under Host the name or IP address of the NAS, under User your user, and under Folder the share (and, if you like, a folder in it). The password stays in that app; this page never sees it. Leave “Read only” off."
        : "Add a connection in it: under Host type " + a.host + (a.port ? ", under Port " + a.port : "") + (a.domain ? ", under Domain " + a.domain : "") + (a.login ? ", under User " + a.login : "") + ", and under Folder " + a.above + ". The app then shows the address " + a.aboveUrl + ". The password stays in that app; this page never sees it. Leave “Read only” off."; },
      andPick:function(a, btn){ return "Press “" + btn + "” here. In the file chooser open the ☰ menu, choose “" + SMB_APP + "”, then your connection, " + (a.folder ? "open the folder " + a.folder : "open the folder you want to sync with (you can create it there)") + " and tap the button at the bottom (“Use this folder”), then “Allow”."; },
      andRule:"The sync folder is the one chosen in the last step. The connection in the app only makes it visible: it may point at that folder or at any folder above it.",
      andAwake:"If the button stays ◌ at home, open " + SMB_APP + " once and press NAS again: Android stops apps that are not in use. In its settings you can switch on “Show notification when opening files”, which keeps it running while files are in use.",
      appLink:SMB_APP + " on Google Play",
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
      outTitle:"Files waiting to go to the NAS",
      outNone:"No file is waiting.",
      outOff:"Sync is off. The files below were left from before; they go to the NAS once you choose a folder again.",
      routeAlso:"Saved files go onto this device as before (into the 📁 folder, through the share sheet or as a download), and a copy waits here to go to the NAS.",
      routeBtn:"Where saved files go…",
      outTotal:function(n, size){ return filesEn(n) + ", " + size + " in total."; },
      outFree:function(free){ return " Free space on this device: about " + free + "."; },
      outMore:function(n){ return "… and " + n + " more."; },
      outWarn:"This device is almost out of space: the waiting files do not have much room left. Open the app at home so they reach the NAS, or save them another way and remove them from the list.",
      outSave:"Save another way",
      outRemove:"Remove",
      outAsk:"The file has not reached the NAS yet. Remove it from the queue?",
      outYes:"Yes, remove",
      outNo:"No",
      outRemoved:function(n){ return "“" + n + "” was removed from the queue."; },
      outSaveFailed:"The file could not be saved another way.",
      outGone:"The file is no longer waiting.",
      errLost:"The file is no longer on this device: the browser cleared it.",
      errFull:"The last attempt failed: the NAS is out of space.",
      errDenied:"The last attempt failed: writing into the folder was refused.",
      errFailed:function(n){ return "Writing to the NAS failed (" + (n === 1 ? "one attempt" : n + " attempts") + "). It will be tried again later."; },
      copyFailed:function(n){ return "The file was saved as usual, but the copy for the NAS could not be kept: " + n; },
      calBad:"The calendar file on the NAS (calendar/events.json) cannot be read or is not valid. Nothing was changed.",
      calNewer:"The calendar file on the NAS was written by a newer version of the app. Update the app on this device.",
      ageNow:"just now",
      ageMin:function(n){ return n + " min ago"; },
      ageHours:function(n){ return n + " h ago"; },
      ageDays:function(n){ return n === 1 ? "1 day ago" : n + " days ago"; },
      close:"Close"
    }
  };

  // Romanian counts: 1 fișier, 2 fișiere, 20 de fișiere.
  function filesRo(n){
    if(n === 1) return "1 fișier";
    var tail = n % 100;
    return n + (n === 0 || (tail > 0 && tail < 20) ? " fișiere" : " de fișiere");
  }

  function filesEn(n){ return n + (n === 1 ? " file" : " files"); }

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
    var semi = user.indexOf(";"), above = parts.slice(0, -1);
    if(!above.length) above = [share];
    return {
      ok:true, user:user, host:host, port:port, share:share, path:path, hadPassword:hadPassword,
      // What is kept and shown: the address as typed, minus any password.
      url:"smb://" + who + where + "/" + parts.map(encodeURIComponent).join("/") + "/",
      // What a system mounts: the share itself, without the folders inside it.
      shareUrl:"smb://" + who + where + "/" + encodeURIComponent(share) + "/",
      unc:"\\\\" + host + "\\" + share,
      // The address is that of the sync folder: its last name is the folder
      // to choose ("" when the address stops at the share), `inShare` is
      // where it lies in the mounted share, and `above` is what holds it -
      // what an SMB app on a phone is pointed at, and shows as `aboveUrl`.
      folder:path.length ? path[path.length - 1] : "",
      inShare:path.join("/"),
      above:above.join("/"),
      aboveUrl:"smb://" + where + "/" + above.join("/"),
      // "DOMAIN;user", as an SMB app asks for the two.
      domain:semi >= 0 ? user.slice(0, semi) : "",
      login:semi >= 0 ? user.slice(semi + 1) : user
    };
  }

  // A relative path of folders, "" for none. Until 2026-11-20 the sheet kept
  // a "default folder" beside the address; this still reads one that is stored.
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
      try{ r = indexedDB.open(DB_NAME, 2); }catch(e){ rej(e); return; }
      r.onupgradeneeded = function(){
        var d = r.result, has = d.objectStoreNames;
        if(!has.contains(DB_STORE)) d.createObjectStore(DB_STORE);
        // Version 2, the outbox: one entry per waiting file, oldest first,
        // and the file bodies where there is no origin-private file system.
        if(!has.contains(OUTBOX)) d.createObjectStore(OUTBOX, { keyPath:"id", autoIncrement:true });
        if(!has.contains(BYTES)) d.createObjectStore(BYTES);
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
  // One transaction over `stores`; `run` gets it and may return a request,
  // whose result is what the promise resolves to once all of it is written.
  function dbTx(stores, mode, run){
    return db().then(function(d){
      return new Promise(function(res, rej){
        var t = d.transaction(stores, mode), q = run(t);
        t.oncomplete = function(){ res(q ? q.result : undefined); };
        t.onerror = t.onabort = function(){ rej(t.error || new Error("aborted")); };
      });
    });
  }
  function dbRun(mode, run){
    return dbTx(DB_STORE, mode, function(t){ return run(t.objectStore(DB_STORE)); });
  }
  // The address is a short string, so localStorage can stand in where
  // IndexedDB is refused (some private windows). The folder handle has no
  // such fallback: only IndexedDB can hold one, and pickFolder() says so.
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

  // The address is a note: where the sync folder lies on the NAS, as the
  // person typed it. The page cannot open it and cannot read the path of
  // the folder that was chosen, so the two are held together by the one
  // thing it does know of both - the folder's name (aligned(), below).
  var address = null;       // parseAddress() result, or null
  var sameAs = "";          // the store id of the folder the person said this address is, under another name

  // Names as a share compares them: neither case nor the Unicode form tells
  // two folders apart.
  function fold(text){
    var t = String(text);
    try{ t = t.normalize("NFC"); }catch(e){}
    return t.toLowerCase();
  }
  // Does the noted address name the chosen folder? "" when there is nothing
  // to compare (no folder, no address, or an address that stops at the
  // share), "same" when its last name is the folder's or the person said it
  // is that folder, "other" when it names another one.
  function aligned(){
    if(!nas || !address || !address.folder) return "";
    return sameAs === nas.storeId || fold(address.folder) === fold(nas.name) ? "same" : "other";
  }
  // A folder can be met under another name than the NAS gives it (a mount
  // point, the name of a connection in the phone's SMB app). The person
  // says so once; it holds for this folder and this address only.
  function confirmSame(){
    if(!nas || !address) return Promise.resolve({ ok:false, message:"" });
    var id = nas.storeId;
    return storeAddress({ url:address.url, same:id }).then(function(ok){
      if(ok) sameAs = id;
      return { ok:ok, message:tx(ok ? "sameKept" : "storeFailed") };
    });
  }

  // Returns { ok, message } and never throws. An empty address forgets it.
  function setAddress(addrText){
    var typed = String(addrText == null ? "" : addrText).trim();
    if(!typed){
      return storeAddress(null).then(function(ok){
        if(ok){ address = null; sameAs = ""; }
        return { ok:ok, cleared:ok, message:tx(ok ? "cleared" : "storeFailed") };
      });
    }
    var a = parseAddress(typed);
    if(!a.ok) return Promise.resolve({ ok:false, field:"address", message:tx(a.error) });
    // "The same folder" was said of the address as it stood.
    var same = address && address.url === a.url ? sameAs : "";
    return storeAddress(same ? { url:a.url, same:same } : { url:a.url }).then(function(ok){
      if(!ok) return { ok:false, message:tx("storeFailed") };
      address = a; sameAs = same;
      // Typing the address does not choose the folder: say what comes next,
      // or that it names another folder than the one chosen.
      var said = !nas ? tx("savedPick") : aligned() === "other" ? tx("savedOther")(a.folder, nas.name) : tx("saved");
      return { ok:true, hadPassword:a.hadPassword, other:!!nas && aligned() === "other",
               message:(a.hadPassword ? tx("passwordDropped") + " " : "") + said };
    });
  }

  // `loaded`: what this device remembers has been read. `ready`: home or
  // away has been decided as well, and the waiting files counted.
  var loaded = loadAddress().then(function(v){
    // What was stored is read back through the same validation as what is typed.
    var a = v && typeof v.url === "string" ? parseAddress(v.url) : null;
    // Stored before 2026-11-20: the address of what holds the folder, and
    // the folder as a second string. Read as the one address they meant.
    var f = a && a.ok && typeof v.folder === "string" ? parseFolder(v.folder) : null;
    if(f && f.ok && f.parts.length){
      var whole = parseAddress(a.url + f.parts.map(encodeURIComponent).join("/"));
      if(whole.ok) a = whole;
    }
    if(a && a.ok){
      address = a;
      sameAs = typeof v.same === "string" && ID_RE.test(v.same) ? v.same : "";
    }
  }).catch(function(){}).then(function(){
    return loadFolder().catch(function(){ return null; });
  }).then(function(rec){
    nas = rec;
    paintButton();
  }).catch(function(){});
  var ready = loaded.then(function(){
    // Home or away is part of being ready, so a page that waits for `ready`
    // reads a decided state. Unconfigured, nothing is probed.
    return nas ? probe() : refreshWaiting();
  }).catch(function(){}).then(function(){});

  /* ---- the nav button ---- */

  var navBtn = document.getElementById("navNasBtn");
  // state: "off" | "away" | "home" | "sync" | "ok" | "ask" | "error"
  var status = { state:"off", waiting:0, at:0, error:"" };
  var MARK = { off:"", away:" ◌", home:" ●", sync:" ↻", ok:" ✓", ask:" ⚠", error:" ✕" };
  // The states that show how many files wait: away, at home with files held
  // back by a failure, and while they are being delivered.
  var COUNTED = { away:1, home:1, sync:1 };

  function clock(ms){
    if(!ms) return "";
    var d = new Date(ms);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function statusText(){
    switch(status.state){
      case "away": return status.waiting > 0 ? tx("tipAwayWaiting")(status.waiting) : tx("tipAway");
      case "home": return status.waiting > 0 ? tx("tipHomeWaiting")(status.waiting) : tx("tipHome");
      case "sync": return status.waiting > 0 ? tx("tipSyncWaiting")(status.waiting) : tx("tipSync");
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
      (COUNTED[status.state] && status.waiting > 0 ? " " + status.waiting : "");
    // Only the button invites a click; inside the sheet the same sentence
    // stands without it.
    var tip = statusText() + (status.state === "off" ? tx("tipOffMore") : "");
    navBtn.title = tip;
    navBtn.setAttribute("aria-label", tip);
  }
  // Presence and the sync passes (later requirements) report through this.
  // Every change of state or of the waiting count is announced to the page.
  // The open sheet is rebuilt only when something it shows changed (or on
  // `force`): a probe that finds nothing new must not disturb typing.
  function setStatus(next, force){
    var known = { off:1, away:1, home:1, sync:1, ok:1, ask:1, error:1 };
    var before = status;
    // A calendar file that cannot be believed is said for as long as it
    // stands there (calFail()), whichever pass or probe settles the button.
    if(calError && next && (next.state === "home" || next.state === "ok")){
      next = { state:"error", waiting:next.waiting, error:tx(calError) };
    }
    status = {
      state: next && known[next.state] ? next.state : "off",
      waiting: next && next.waiting > 0 ? Math.floor(next.waiting) : 0,
      at: next && next.at > 0 ? +next.at : 0,
      error: next && typeof next.error === "string" ? next.error : ""
    };
    paintButton();
    var moved = status.state !== before.state || status.waiting !== before.waiting;
    if((force || moved || status.at !== before.at || status.error !== before.error) &&
       sheet && sheet.classList.contains("open")) render();
    if(moved){
      window.dispatchEvent(new CustomEvent("scula-nas", {
        detail:{ state:status.state, waiting:status.waiting, home:presence.home === true }
      }));
    }
  }

  /* ---- the NAS folder: chosen once, kept apart from the 📁 folder ---- */

  var FOLDER_KEY = "folder";
  var IDENTITY = ".scula-sync.json", FORMAT = 1, ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
  var LOCK = ".scula-lock.json", LOCK_MS = 120000;   // a pass that writes: see lock() in folderStore()
  var LOCK_SETTLE_MS = 250;   // between writing the lock and believing it
  var SETTLE_ROUNDS = 3;      // reads of a file whose size or time moved under the read: see settled()
  var PROBE_MS = 3000;        // a dead mount can hang instead of failing
  var PRESENCE_MS = 180000;   // the timer: at most once every few minutes
  // The page subfolders - SUBDIR in the shared nav block, which keeps the
  // map private. tests/nas.js compares the two lists.
  var SUBDIRS = ["transcript", "calendar", "kanban", "harta", "desen", "markdown", "retete", "transfer"];

  var nas = null;             // { handle, storeId, name } - the remembered folder
  var pending = null;         // a chosen handle that is still the 📁 folder
  // why: "off" | "permission" | "clash" | "gone" | "timeout" | "other"
  var presence = { home:false, why:"off" };
  var shown = "";             // the folder the sheet was last painted for

  function loadFolder(){
    return dbRun("readonly", function(s){ return s.get(FOLDER_KEY); }).then(function(v){
      return v && v.handle && typeof v.storeId === "string" && ID_RE.test(v.storeId)
        ? { handle:v.handle, storeId:v.storeId, name:String(v.handle.name || "") } : null;
    });
  }

  // requestPermission() needs a user gesture: request only from a click.
  function permitted(handle, request){
    if(!handle || typeof handle.queryPermission !== "function") return Promise.resolve(!!handle);
    var opts = { mode:"readwrite" };
    return handle.queryPermission(opts).then(function(state){
      if(state === "granted") return true;
      if(!request || typeof handle.requestPermission !== "function") return false;
      return handle.requestPermission(opts).then(function(s){ return s === "granted"; });
    });
  }

  // Is this the folder ScuLaFolder saves into? Asked without a prompt: when
  // it is the same folder, the grant just given covers both.
  function sameAsFolder(handle){
    var F = window.ScuLaFolder;
    if(!F || typeof F.rootDir !== "function" || typeof handle.isSameEntry !== "function") return Promise.resolve(false);
    return Promise.resolve(F.ready).then(function(){ return F.rootDir(false); }).then(function(root){
      return root ? handle.isSameEntry(root) : false;
    }).catch(function(){ return false; });
  }

  function newId(){
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function(x){ return ("0" + x.toString(16)).slice(-2); }).join("");
  }

  // This device, as the other devices and the person will meet it: a random
  // id (who holds a lock) and a name made of the system and four characters
  // of that id ("Android-3f9a"), which is what a conflict copy is named
  // with. Made on first use and kept on the device; where the browser
  // refuses the storage it lasts for the visit.
  var DEVICE_KEY = "device", devp = null;
  function platform(){
    var ua = navigator.userAgent || "";
    return /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows"
      : /CrOS/i.test(ua) ? "ChromeOS" : /Mac/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Web";
  }
  function device(){
    if(!devp){
      var id = newId(), dev = { id:id, name:platform() + "-" + id.slice(0, 4) };
      // Read and, if there is none, written in one transaction: two tabs
      // opened together end with the same device.
      devp = dbTx(DB_STORE, "readwrite", function(t){
        var s = t.objectStore(DB_STORE), q = s.get(DEVICE_KEY);
        q.onsuccess = function(){
          var r = q.result;
          if(r && typeof r.id === "string" && ID_RE.test(r.id) && typeof r.name === "string" && r.name) dev = { id:r.id, name:r.name };
          else s.put(dev, DEVICE_KEY);
        };
      }).then(function(){ return dev; }, function(){ return dev; });
    }
    return devp;
  }

  // { found:false } only when the folder was reached and carries no identity
  // (no file, or the empty one an interrupted first use leaves behind).
  // { found:true, bad:true } for a file that is not an identity. Every other
  // failure rejects: "could not ask" is never "not there".
  function readIdentity(handle){
    return handle.getFileHandle(IDENTITY).then(function(fh){
      return fh.getFile().then(function(file){
        if(file.size === 0) return { found:false };
        if(file.size > 4096) return { found:true, bad:true };
        return file.text().then(function(text){
          var o = null;
          try{ o = JSON.parse(text); }catch(e){}
          if(!o || typeof o !== "object" || typeof o.id !== "string" || !ID_RE.test(o.id) ||
             typeof o.v !== "number" || o.v < 1 || o.v !== Math.floor(o.v)) return { found:true, bad:true };
          return { found:true, id:o.id, v:o.v };
        });
      });
    }, function(e){
      if(e && e.name === "NotFoundError") return { found:false };
      throw e;
    });
  }
  // The browser writes to a temporary file and swaps it in on close(), so
  // the folder holds no identity or the whole one. Read back before trusting.
  function writeIdentity(handle, id){
    var body = JSON.stringify({ app:"scula", v:FORMAT, id:id, created:Date.now() }, null, 2) + "\n";
    return handle.getFileHandle(IDENTITY, { create:true }).then(function(fh){
      return fh.createWritable();
    }).then(function(w){
      return w.write(body).then(function(){ return w.close(); }, function(e){
        return Promise.resolve().then(function(){ return w.abort(); }).catch(function(){}).then(function(){ throw e; });
      });
    }).then(function(){ return readIdentity(handle); }).then(function(got){
      if(!got.found || got.bad || got.id !== id) throw new Error("identity not written");
    });
  }

  var TIMEOUT = {};
  function within(work, ms){
    return new Promise(function(res, rej){
      var t = setTimeout(function(){ rej(TIMEOUT); }, ms);
      work.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
    });
  }

  // The file store the sync code is written against (02-implementation-plan.md):
  // the passes read and write the NAS through these calls only, and nothing
  // outside this script holds the folder handle.
  //
  // A path is an array of names below the NAS folder, each one checked, so
  // that no name read from a manifest can leave the folder. "Not there" is
  // an answer - null - only when the folder was reached and the name is not
  // in it: a share that went away answers every question with "not found",
  // so each null is confirmed against the identity file. Every other failure
  // throws, and a throw ends the pass. Absence is never read as deletion.
  function folderStore(handle, id){
    function checked(path){
      if(!Array.isArray(path) || !path.length || path.length > MAX_SEGMENTS + 4 || !path.every(safeName)) throw new Error("path");
      return path;
    }
    function absent(e){ return !!e && e.name === "NotFoundError"; }
    function tagOf(file){ return file.size + ":" + file.lastModified; }
    // A file with its bytes read, as it stands. Some mounts (KDE's kio-fuse)
    // answer a file's size and time from memory for half a minute after
    // another device changed it, and only opening the file refreshes them.
    // getFile() then has the old size and the browser reads that many bytes:
    // a cut text, or NotReadableError when the file shrank. The bytes count
    // only when the size and time asked again after reading are the same.
    async function settled(fh){
      for(var round = 1; ; round++){
        var f = await fh.getFile(), bytes = null, err = null;
        try{ bytes = await f.arrayBuffer(); }catch(e){ err = e; }
        var g = await fh.getFile();
        // Still another one after a few rounds: being written right now, and
        // what was read is passed on as any read of a file being written is.
        if((g.size !== f.size || g.lastModified !== f.lastModified) && round < SETTLE_ROUNDS) continue;
        if(err) throw err;
        return new File([bytes], fh.name, { type:f.type, lastModified:f.lastModified });
      }
    }
    async function reached(){
      var idf = await readIdentity(handle);
      if(!idf.found || idf.bad || idf.id !== id) throw new Error("away");
    }
    // The folder at `path`, made on the way with `create`; null when it is not there.
    async function dirAt(path, create){
      var d = handle;
      for(var i = 0; i < path.length; i++){
        try{ d = await d.getDirectoryHandle(path[i], create ? { create:true } : undefined); }
        catch(e){ if(!create && absent(e)) return null; throw e; }
      }
      return d;
    }
    // "file", "dir" or "" for a name in a folder.
    async function kindOf(d, name){
      try{ await d.getFileHandle(name); return "file"; }
      catch(e){
        if(e && e.name === "TypeMismatchError") return "dir";
        if(absent(e)) return "";
        throw e;
      }
    }
    // A file to another path, moved or (with `keep`) copied; folders on the
    // way are made. Nothing is overwritten: a name that is taken gets the
    // next free one (a.md, a-1.md) - unless what stands there is this very
    // file, an earlier attempt cut short, which is then only finished.
    async function transfer(from, to, keep){
      checked(from); checked(to);
      var last = from[from.length - 1], sd = await dirAt(from.slice(0, -1), false), fh = null;
      if(sd){ try{ fh = await sd.getFileHandle(last); }catch(e){ if(!absent(e)) throw e; } }
      if(!fh){ await reached(); return null; }
      var body = await settled(fh), td = await dirAt(to.slice(0, -1), true);
      var want = to[to.length - 1], dot = want.lastIndexOf("."), base = dot > 0 ? want.slice(0, dot) : want, ext = dot > 0 ? want.slice(dot) : "";
      var name = null;
      for(var i = 0; i <= 500 && name === null; i++){
        var candidate = i === 0 ? want : base + "-" + i + ext, kind = await kindOf(td, candidate);
        if(!kind) name = candidate;
        else if(kind === "file" && await sameBytes(await settled(await td.getFileHandle(candidate)), body)){
          if(!keep) await sd.removeEntry(last);
          return { path:to.slice(0, -1).concat(candidate) };
        }
      }
      if(name === null) throw new Error("names");
      var moved = false;
      if(!keep && canMove && typeof fh.move === "function"){
        try{ await fh.move(td, name); moved = true; }catch(e){ canMove = false; }
      }
      if(!moved){
        // A copy, or a folder that cannot rename: written, read back, and
        // only then is the original removed.
        await put(td, name, body, false);
        if(!keep) await sd.removeEntry(last);
      }
      return { path:to.slice(0, -1).concat(name) };
    }
    // The bytes under `name` in folder `d`: under a temporary name, then
    // renamed into place and read back, so that the folder holds the old
    // file or the new one, never half of one.
    async function put(d, name, blob, had){
      var done = false, part = ".scula-" + newId() + ".part";
      if(canMove && typeof FileSystemFileHandle.prototype.move === "function"){
        var tmp = await d.getFileHandle(part, { create:true });
        try{
          await writeAll(tmp, blob);
          if((await tmp.getFile()).size !== blob.size) throw new Error("size");
        }catch(e){ await d.removeEntry(part).catch(noop); throw e; }
        try{ await tmp.move(name); done = true; }
        catch(e){
          // This folder cannot rename (some storage providers): written in
          // place, where the browser's own swap file is the temporary one.
          canMove = false;
          await d.removeEntry(part).catch(noop);
        }
      }
      if(!done){
        try{ await writeAll(await d.getFileHandle(name, { create:true }), blob); }
        catch(e){
          if(!had) await d.removeEntry(name).catch(noop);     // not even an empty file is left behind
          throw e;
        }
      }
      // (Replaced by another device as it was read back: their bytes, "size".)
      var f = await settled(await d.getFileHandle(name));
      if(!await sameBytes(f, blob)) throw new Error("size");
      return f;
    }
    // The lock file of a folder: { device, expires }, or null when there is
    // none or it cannot be understood (a write cut short). `live`: it still
    // holds - not run out, and not more than one lifetime ahead, which is a
    // clock that is wrong and would otherwise hold for ever.
    async function readLock(d){
      var text = null;
      if(!d) return null;
      try{ text = await (await settled(await d.getFileHandle(LOCK))).text(); }
      catch(e){ if(absent(e)) return null; throw e; }
      var o = null;
      try{ o = JSON.parse(text); }catch(e){}
      if(!o || typeof o !== "object" || typeof o.device !== "string" || !isFinite(o.expires)) return null;
      var left = o.expires - Date.now();
      return { device:o.device, expires:+o.expires, live:left > 0 && left <= LOCK_MS };
    }
    return {
      id: id,
      // Home only when the identity file is read and carries the expected id.
      // No permission, no folder, no file, another id and no answer in time
      // are all "away" - never an empty store, never a prompt.
      probe: function(expect){
        var work = permitted(handle, false).then(function(ok){
          if(!ok) return { home:false, why:"permission" };
          return readIdentity(handle).then(function(idf){
            if(!idf.found) return { home:false, why:"gone" };
            if(idf.bad || idf.id !== expect) return { home:false, why:"other" };
            return { home:true, id:idf.id };
          });
        });
        return within(work, PROBE_MS).catch(function(e){
          return { home:false, why:e === TIMEOUT ? "timeout" : "gone" };
        });
      },
      // A name as it can stand on the NAS; what a folder cannot hold is replaced.
      safe: fileName,
      // [{ name, dir, size, modified, tag }]: [] for an empty folder, null
      // when the folder is not there.
      list: async function(path){
        var d = await dirAt(checked(path), false);
        if(!d){ await reached(); return null; }
        var out = [];
        for await (var pair of d.entries()){
          if(pair[1].kind === "directory"){ out.push({ name:pair[0], dir:true, size:0, modified:0, tag:"" }); continue; }
          var f = null;
          try{ f = await pair[1].getFile(); }catch(e){ if(!absent(e)) throw e; }
          if(f) out.push({ name:pair[0], dir:false, size:f.size, modified:f.lastModified, tag:tagOf(f) });
        }
        return out;
      },
      // { blob, size, tag }, or null when the file is not there.
      read: async function(path){
        var d = await dirAt(checked(path).slice(0, -1), false), f = null;
        if(d){
          try{ f = await settled(await d.getFileHandle(path[path.length - 1])); }
          catch(e){ if(!absent(e)) throw e; }
        }
        if(!f){ await reached(); return null; }
        return { blob:f, size:f.size, tag:tagOf(f) };
      },
      // Temporary name, rename, read back - see put(). With { ifAbsent } a
      // name that is taken is refused ("exists"). Resolves { size, tag }.
      write: async function(path, blob, opts){
        var name = checked(path)[path.length - 1], d = await dirAt(path.slice(0, -1), true);
        var had = await kindOf(d, name);
        if(had && opts && opts.ifAbsent) throw new Error("exists");
        var f = await put(d, name, blob, !!had);
        return { size:f.size, tag:tagOf(f) };
      },
      // Resolve { path } - where the file went - or null when nothing stood
      // at `from`. See transfer().
      move: function(from, to){ return transfer(from, to, false); },
      copy: function(from, to){ return transfer(from, to, true); },
      mkdir: function(path){ return dirAt(checked(path), true).then(function(){ return true; }); },
      // An advisory lock for a pass that writes: `.scula-lock.json` in the
      // folder at `path`, naming this device and when it runs out. It keeps
      // two devices from rewriting one manifest at the same moment. It
      // protects nothing by itself - a pass still reads the manifest again
      // before it writes it - so a lock that cannot be read does not hold.
      // lockOf(): "other" while another device holds it, "mine" for one of
      // this device's (left by a pass that died, if no pass is running),
      // else "". lock(): take it, or renew ours - true when it is ours.
      // unlock(): remove it, if it is ours.
      LOCK_MS: LOCK_MS,
      lockOf: async function(path){
        var dev = await device(), l = await readLock(await dirAt(checked(path), false));
        return !l ? "" : l.device === dev.id ? "mine" : l.live ? "other" : "";
      },
      lock: async function(path){
        var dev = await device(), d = await dirAt(checked(path), true), l = await readLock(d);
        if(l && l.live && l.device !== dev.id) return false;
        var body = new Blob([JSON.stringify({ device:dev.id, expires:Date.now() + LOCK_MS })], { type:"application/json" });
        try{ await put(d, LOCK, body, !!(await kindOf(d, LOCK))); }
        catch(e){
          if(e && e.message === "size") return false;   // replaced as it was written: theirs
          // Written over or removed by another device at that very moment,
          // which a real share answers with these: theirs now, or nobody's
          // while the folder answers - not ours, and asked for again.
          if(e && /^(InvalidStateError|NotReadableError|NotFoundError)$/.test(e.name)){
            var now = await readLock(d);
            if(now ? now.device !== dev.id : e.name !== "InvalidStateError"){ await reached(); return false; }
          }
          throw e;
        }
        // Two devices can both find it free and both write it. The file
        // that stands a moment later is the one that was written last, and
        // only its device goes on. (Renewing one's own needs no such wait.)
        if(!l || l.device !== dev.id) await new Promise(function(done){ setTimeout(done, LOCK_SETTLE_MS); });
        l = await readLock(d);
        return !!l && l.device === dev.id;
      },
      unlock: async function(path){
        var dev = await device(), d = await dirAt(checked(path), false), l = await readLock(d);
        if(!l || l.device !== dev.id) return false;
        try{ await d.removeEntry(LOCK); }catch(e){ if(!absent(e)) throw e; }
        return true;
      },
      // Removes a folder only when it is empty; false when it is not.
      rmdir: async function(path){
        var d = await dirAt(checked(path).slice(0, -1), false);
        if(!d){ await reached(); return true; }
        try{ await d.removeEntry(path[path.length - 1]); return true; }
        catch(e){
          if(absent(e)) return true;
          if(e && e.name === "InvalidModificationError") return false;
          throw e;
        }
      }
    };
  }

  /* ---- presence: home or away ---- */

  function applyPresence(force){
    var s = status.state, next;
    if(presence.home) next = s === "sync" || s === "ok" ? s : "home";   // a pass owns those two
    else if(presence.why === "off") next = "off";
    else if(presence.why === "permission") next = "ask";
    else if(presence.why === "clash") next = "error";
    else next = "away";
    setStatus({
      state:next, waiting:status.waiting, at:next === s ? status.at : 0,
      error:next === "error" ? tx("clash")(nas ? nas.name : "") : ""
    }, force);
  }

  function runProbe(){
    var had = !!nas;
    // What is remembered is read again each time: another tab may have
    // chosen or forgotten the folder.
    return loadFolder().catch(function(){ return nas; }).then(function(rec){
      nas = rec;
      if(!rec) return { home:false, why:"off" };
      return within(sameAsFolder(rec.handle), PROBE_MS).then(function(same){
        return same ? { home:false, why:"clash" } : folderStore(rec.handle, rec.storeId).probe(rec.storeId);
      });
    }).catch(function(e){
      return { home:false, why:e === TIMEOUT ? "timeout" : "gone" };
    }).then(function(r){
      var folderWas = shown;
      shown = nas ? nas.name + "\n" + nas.storeId : "";
      var news = r.home !== presence.home || r.why !== presence.why || shown !== folderWas;
      var cameHome = r.home && !presence.home;
      presence = r;
      if(nas) watch(); else unwatch();
      // A device that was and stays unconfigured has nothing to repaint.
      if(nas || had) applyPresence(news);
      // Another tab may have queued or delivered files; at home, what waits
      // is delivered.
      return refreshWaiting().then(function(){
        if(r.home) flushSoon();
        if(cameHome) calSoon();
        return r;
      });
    });
  }

  // One probe at a time. A call made while one runs gets a fresh run after
  // it, never the answer to an older question.
  var running = null, queued = null;
  function probe(){
    if(queued) return queued;
    if(running){
      queued = running.then(function(){ queued = null; return probe(); });
      return queued;
    }
    running = runProbe().then(function(r){ running = null; return r; });
    return running;
  }

  var timer = 0;
  function watch(){
    if(timer) return;
    timer = setInterval(function(){ if(document.visibilityState === "visible") look(); }, PRESENCE_MS);
  }
  function unwatch(){ if(timer){ clearInterval(timer); timer = 0; } }

  // The page is looked at again: home or away is decided again, and at home
  // the calendar is compared with the NAS - another device may have been there.
  function look(){
    return probe().then(function(r){ if(r.home) calSoon(); return r; });
  }
  window.addEventListener("online", function(){ look(); });
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "visible") look();
  });
  // The 📁 folder changed: it may now be, or no longer be, the NAS folder.
  window.addEventListener("scula-folder", function(){ if(nas) probe(); });

  // The one click that restores access when only the permission is missing.
  function regrant(){
    if(!nas) return Promise.resolve(false);
    return permitted(nas.handle, true).catch(function(){ return false; }).then(function(ok){
      return probe().then(function(){ return ok; });
    });
  }

  /* ---- choosing and forgetting the folder ---- */

  function remember(handle, id, how){
    var name = String(handle.name || "");
    return dbRun("readwrite", function(s){ return s.put({ handle:handle, storeId:id }, FOLDER_KEY); }).then(function(){
      nas = { handle:handle, storeId:id, name:name };
      pending = null;
      // From here on files wait on this device for the NAS: ask the browser
      // not to clear them on its own. It answers without a prompt.
      try{
        if(navigator.storage && typeof navigator.storage.persist === "function") navigator.storage.persist().catch(function(){});
      }catch(e){}
      return probe().then(function(){ return { ok:true, joined:how === "joined", message:tx(how)(name) }; });
    }, function(){ return { ok:false, message:tx("notKept") }; });
  }

  // A folder that carries an identity is joined as it is. Otherwise this is
  // its first use: the page subfolders first, the identity last, so that an
  // identity always means a finished first use.
  function adopt(handle){
    return readIdentity(handle).then(function(idf){
      if(idf.found){
        if(idf.bad) return { ok:false, message:tx("badIdentity") };
        if(idf.v > FORMAT) return { ok:false, message:tx("newerIdentity") };
        return remember(handle, idf.id, "joined");
      }
      var id = newId(), chain = Promise.resolve();
      SUBDIRS.forEach(function(name){
        chain = chain.then(function(){ return handle.getDirectoryHandle(name, { create:true }); });
      });
      return chain.then(function(){ return writeIdentity(handle, id); })
        .then(function(){ return remember(handle, id, "picked"); });
    }).catch(function(){ return { ok:false, message:tx("pickFailed") }; });
  }

  // Resolves { ok, message } and never throws; { cancelled:true } when the
  // chooser was closed. Must be called from a click.
  function pickFolder(){
    if(typeof window.showDirectoryPicker !== "function") return Promise.resolve({ ok:false, message:tx("pickerNo") });
    pending = null;
    return window.showDirectoryPicker({ id:"scula-nas", mode:"readwrite" }).then(function(h){
      return permitted(h, true).then(function(ok){
        if(!ok) return { ok:false, message:tx("denied") };
        return sameAsFolder(h).then(function(same){
          if(!same) return adopt(h);
          pending = h;
          return { ok:false, clash:true, message:tx("clash")(String(h.name || "")) };
        });
      });
    }, function(e){
      return e && e.name === "AbortError" ? { ok:false, cancelled:true, message:"" }
                                          : { ok:false, message:tx("pickFailed") };
    }).catch(function(){ return { ok:false, message:tx("pickFailed") }; });
  }

  // The same folder was 📁 and NAS: stop using it as 📁, keep it for the NAS.
  function release(){
    var F = window.ScuLaFolder, h = pending || (nas && nas.handle);
    if(!h || !F || typeof F.forget !== "function") return Promise.resolve({ ok:false, message:tx("pickFailed") });
    return sameAsFolder(h).then(function(same){
      return same ? F.forget() : null;        // 📁 was pointed elsewhere meanwhile: leave it
    }).then(function(){
      if(pending) return adopt(pending);
      return probe().then(function(){ return { ok:true, message:"" }; });
    }).catch(function(){ return { ok:false, message:tx("pickFailed") }; });
  }

  // Removes what this device remembers. Nothing on the NAS is touched.
  function forgetFolder(){
    pending = null;
    return dbRun("readwrite", function(s){ return s.delete(FOLDER_KEY); }).then(function(){
      nas = null;
      unwatch();
      presence = { home:false, why:"off" };
      shown = "";
      calError = "";
      applyPresence(true);
      return { ok:true, message:tx("forgotten") };
    }, function(){ return { ok:false, message:tx("forgetFailed") }; });
  }

  /* ---- the outbox: saved files wait here until the device is home ---- */

  var BODY_DIR = "scula-nas-outbox";
  var STREAM_CAP = 32 * 1048576;            // a stream held as one Blob, as ScuLaFolder does
  var BACKOFF = [60000, 300000, 1800000];   // after a failure; then once every visit
  var ORPHAN_MS = 86400000;
  var CHUNK = 4 * 1048576;
  var LOW_SPACE = 16 * 1048576;
  var LISTED = 50;
  var PING_KEY = "scula:nas:outbox";        // tells the other tabs the queue changed
  var PAGE = { transcript:"Caiet vocal", calendar:"Calendar", kanban:"Kanban", harta:"Hartă",
               desen:"Mazgaleste", markdown:"Markdown", retete:"Rețete", transfer:"Transfer" };
  var held = {};                            // entry id -> not before this time, in this visit
  var canMove = true;                       // until a folder refuses move()
  function noop(){}

  // A file name as it will stand on the NAS: what a folder cannot hold is
  // replaced, never used to climb out of the page's subfolder.
  function fileName(s){
    s = String(s == null ? "" : s).replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, "_").replace(/[. ]+$/, "").slice(0, 255);
    return s === "" ? "file" : s;
  }

  // Where the bodies are kept: a folder of the origin-private file system,
  // which takes a stream without holding the file in memory. null where the
  // browser has none (file://, some private windows): IndexedDB then.
  var bodyDirP = null;
  function bodyDir(){
    if(!bodyDirP){
      var st = navigator.storage;
      var can = st && typeof st.getDirectory === "function" && typeof FileSystemFileHandle !== "undefined" &&
        typeof FileSystemFileHandle.prototype.createWritable === "function";
      bodyDirP = (can ? st.getDirectory().then(function(r){ return r.getDirectoryHandle(BODY_DIR, { create:true }); })
                      : Promise.resolve(null)).catch(function(){ return null; });
    }
    return bodyDirP;
  }

  async function writeAll(fh, blob){
    var w = await fh.createWritable();
    try{ await w.write(blob); await w.close(); }
    catch(e){ try{ await w.abort(); }catch(_){} throw e; }
  }

  // Puts the bytes of `source` (a Blob, or { size, type, stream() }) on the
  // device and resolves to where: { kind:"opfs", key } or { kind:"idb", key,
  // blob } - the blob still to be written, with its entry, by the caller.
  async function keepBody(source, size){
    var key = newId(), dir = await bodyDir(), isBlob = source instanceof Blob, n = 0;
    if(!dir){
      if(isBlob) return { kind:"idb", key:key, blob:source };
      if(size > STREAM_CAP) throw new Error("tooBig");
      var chunks = [];
      for await (var part of source.stream()){
        n += part.byteLength;
        if(n > size) throw new Error("size");
        chunks.push(new Blob([part]));
      }
      if(n !== size) throw new Error("size");
      if(source.check) source.check();
      return { kind:"idb", key:key, blob:new Blob(chunks, { type:source.type || "" }) };
    }
    var fh = await dir.getFileHandle(key, { create:true });
    try{
      if(isBlob) await writeAll(fh, source);
      else{
        var w = await fh.createWritable();
        try{
          for await (var chunk of source.stream()){
            n += chunk.byteLength;
            if(n > size) throw new Error("size");
            await w.write(chunk);
          }
          if(n !== size) throw new Error("size");
          if(source.check) source.check();
          await w.close();
        }catch(e){ try{ await w.abort(); }catch(_){} throw e; }
      }
      if((await fh.getFile()).size !== size) throw new Error("size");
    }catch(e){
      await dir.removeEntry(key).catch(noop);
      throw e;
    }
    return { kind:"opfs", key:key };
  }
  function dropBody(body){
    if(body.kind !== "opfs") return Promise.resolve();
    return bodyDir().then(function(d){ return d ? d.removeEntry(body.key) : null; }).catch(noop);
  }
  async function bodyOf(e){
    var b = null;
    try{
      if(e.body.kind === "idb") b = await dbTx(BYTES, "readonly", function(t){ return t.objectStore(BYTES).get(e.body.key); });
      else{
        var dir = await bodyDir();
        if(dir) b = await (await dir.getFileHandle(e.body.key)).getFile();
      }
    }catch(err){}
    if(!(b instanceof Blob) || b.size !== e.size) throw new Error("lost");
    return b;
  }

  function entries(){
    return dbTx(OUTBOX, "readonly", function(t){ return t.objectStore(OUTBOX).getAll(); });
  }
  // Writes an entry back only while it is still queued: a file removed by
  // the person during a delivery does not come back.
  function saveEntry(e){
    return dbTx(OUTBOX, "readwrite", function(t){
      var s = t.objectStore(OUTBOX), q = s.get(e.id);
      q.onsuccess = function(){
        if(!q.result) return;
        try{ s.put(e); }catch(err){ t.abort(); }
      };
    });
  }
  // The entry first, its body after: a crash in between leaves a body with
  // no entry, which sweep() clears, never an entry with no body.
  function dropEntry(e){
    return dbTx([OUTBOX, BYTES], "readwrite", function(t){
      t.objectStore(OUTBOX).delete(e.id);
      if(e.body.kind === "idb") t.objectStore(BYTES).delete(e.body.key);
    }).then(function(){ return dropBody(e.body); });
  }

  function refreshWaiting(){
    return dbTx(OUTBOX, "readonly", function(t){ return t.objectStore(OUTBOX).count(); }).then(function(n){
      if(n !== status.waiting) setStatus({ state:status.state, waiting:n, at:status.at, error:status.error });
      return n;
    }, function(){ return status.waiting; });
  }
  // The queue changed here: say so to the other tabs, recount, and deliver
  // if the device is home.
  function changed(){
    try{ localStorage.setItem(PING_KEY, String(Date.now())); }catch(e){}
    return refreshWaiting().then(function(){ if(presence.home) flushSoon(); });
  }
  window.addEventListener("storage", function(ev){
    if(ev.key === PING_KEY) refreshWaiting().then(function(){ if(presence.home) flushSoon(); });
  });

  // ScuLaFolder.save() calls this for every saved file. Resolves, never
  // rejects: { queued:true, id }, { queued:false, off:true } when there is
  // nothing to queue for, or { queued:false } when the device could not
  // take the file. `copy` marks the copy of a save that already went its
  // ordinary way: only then is a failure said here, in the shared toast.
  function queue(subdir, directories, name, source, opts){
    return loaded.then(function(){
      // Off - or the 📁 folder is the NAS folder itself, and the save just
      // went into it.
      if(!nas || presence.why === "clash") return { queued:false, off:true };
      var dirs = Array.isArray(directories) ? directories.slice() : [];
      var size = source ? source.size : NaN;
      if(!safeName(subdir) || dirs.length > MAX_SEGMENTS || !dirs.every(safeName)) throw new Error("path");
      if(!(source instanceof Blob || (source && typeof source.stream === "function")) ||
         !Number.isSafeInteger(size) || size < 0) throw new Error("source");
      return keepBody(source, size).then(function(body){
        var e = { subdir:subdir, dirs:dirs, name:fileName(name), size:size, type:String(source.type || ""),
                  created:Date.now(), tries:0, error:"", next:0, body:{ kind:body.kind, key:body.key } };
        return dbTx(body.blob ? [OUTBOX, BYTES] : OUTBOX, "readwrite", function(t){
          if(body.blob) t.objectStore(BYTES).put(body.blob, body.key);
          return t.objectStore(OUTBOX).add(e);
        }).then(function(id){
          return changed().then(function(){ return { queued:true, id:id }; });
        }, function(err){
          return dropBody(body).then(function(){ throw err; });
        });
      });
    }).catch(function(){ return { queued:false }; }).then(function(r){
      if(!r.queued && !r.off && opts && opts.copy && window.ScuLaFolder && typeof window.ScuLaFolder.toast === "function"){
        window.ScuLaFolder.toast(tx("copyFailed")(String(name)));
      }
      return r;
    });
  }

  async function sameBytes(a, b){
    if(a.size !== b.size) return false;
    for(var at = 0; at < a.size; at += CHUNK){
      var x = new Uint8Array(await a.slice(at, at + CHUNK).arrayBuffer());
      var y = new Uint8Array(await b.slice(at, at + CHUNK).arrayBuffer());
      if(x.length !== y.length) return false;
      for(var i = 0; i < x.length; i++) if(x[i] !== y[i]) return false;
    }
    return true;
  }

  // One file into <NAS folder>/<page subfolder>/…. Returns the name it
  // stands under. Throws when it could not be delivered - "could not ask" is
  // never read as "the name is free".
  async function deliver(e){
    var body = await bodyOf(e);
    var d = await nas.handle.getDirectoryHandle(e.subdir, { create:true });
    for(var k = 0; k < e.dirs.length; k++) d = await d.getDirectoryHandle(e.dirs[k], { create:true });

    // The name: the file's own, or the next free one. Nothing is overwritten.
    var dot = e.name.lastIndexOf("."), base = dot > 0 ? e.name.slice(0, dot) : e.name, ext = dot > 0 ? e.name.slice(dot) : "";
    var name = null;
    for(var i = 0; i <= 500 && name === null; i++){
      var candidate = i === 0 ? e.name : base + "-" + i + ext, there = null, taken = false;
      try{ there = await (await d.getFileHandle(candidate)).getFile(); }
      catch(err){
        if(err && err.name === "TypeMismatchError") taken = true;          // a folder of that name
        else if(!err || err.name !== "NotFoundError") throw err;
      }
      if(taken) continue;
      if(!there) name = candidate;
      // The same bytes: an earlier flush delivered it and was interrupted
      // before the entry was removed.
      else if(await sameBytes(there, body)) return candidate;
      // The beginning of this very file under the name recorded for it: our
      // own write, interrupted. Finish it.
      else if(candidate === e.target && there.size < body.size &&
              await sameBytes(there, body.slice(0, there.size))) name = candidate;
    }
    if(name === null) throw new Error("names");

    // Under a temporary name, then renamed into place: the folder never
    // shows half a file under the real name.
    var moved = false, part = ".scula-" + e.body.key + ".part";
    if(canMove && typeof FileSystemFileHandle.prototype.move === "function"){
      var tmp = await d.getFileHandle(part, { create:true });
      await writeAll(tmp, body);
      if((await tmp.getFile()).size !== e.size) throw new Error("size");
      try{ await tmp.move(name); moved = true; }
      catch(err){
        // This folder cannot rename (some storage providers). Remember it
        // and write in place, here and for the files that follow.
        canMove = false;
        await d.removeEntry(part).catch(noop);
      }
    }
    if(!moved){
      // No rename: the browser's own write is the temporary file where it
      // has one. The name is recorded first, so that a write cut short is
      // recognised as ours and finished, not taken for someone else's file.
      if(e.tries) await d.removeEntry(part).catch(noop);     // what an earlier attempt may have left
      e.target = name;
      await saveEntry(e);
      await writeAll(await d.getFileHandle(name, { create:true }), body);
    }
    var done = await (await d.getFileHandle(name)).getFile();
    if(done.size !== e.size) throw new Error("size");
    return name;
  }

  // Bodies whose entry is gone (a crash between the two). Only old ones: a
  // file being queued right now has a body and no entry yet.
  async function sweep(list){
    try{
      var dir = await bodyDir();
      if(!dir) return;
      var kept = {}, now = Date.now();
      list.forEach(function(e){ kept[e.body.key] = true; });
      for await (var pair of dir.entries()){
        if(kept[pair[0]] || pair[1].kind !== "file") continue;
        var file = await pair[1].getFile();
        if(now - file.lastModified > ORPHAN_MS) await dir.removeEntry(pair[0]).catch(noop);
      }
    }catch(e){}
  }

  function failure(err){
    var n = err && err.name, m = err && err.message;
    return m === "lost" ? "lost" : n === "QuotaExceededError" ? "full"
      : n === "NotAllowedError" || n === "SecurityError" || n === "NoModificationAllowedError" ? "denied" : "failed";
  }

  // Empties the queue into the NAS folder, oldest first. Runs only at home.
  async function runFlush(){
    if(!nas || !presence.home) return;
    var list = await entries(), now = Date.now();
    await sweep(list);
    // Back-off: an entry that failed waits 1, 5, then 30 minutes; after that
    // it is tried once every visit. `held` keeps the same wait in memory, so
    // a device that cannot write the failure down still does not retry in a
    // loop.
    var due = list.filter(function(e){ return !(e.next > now) && !(held[e.id] > now); });
    if(!due.length) return;
    var sent = 0;
    setStatus({ state:"sync", waiting:list.length });
    for(var i = 0; i < due.length; i++){
      var e = due[i];
      if(!nas || !presence.home) break;
      try{
        await deliver(e);
        await dropEntry(e);
        sent++;
      }catch(err){
        // The file's fault, or the NAS gone? Ask. If the folder no longer
        // answers, nothing is held against the file and the flush stops.
        var p = await probe();
        if(!p.home) break;
        e.tries = (e.tries || 0) + 1;
        e.error = failure(err);
        e.next = e.tries > BACKOFF.length ? 0 : Date.now() + BACKOFF[e.tries - 1];
        held[e.id] = e.next || Infinity;
        await saveEntry(e).catch(noop);
      }
      try{ localStorage.setItem(PING_KEY, String(Date.now())); }catch(_){}
      await refreshWaiting();              // the button counts down
    }
    var left = await refreshWaiting();
    // (A pass that is still running settles the button when it ends.)
    if(presence.home && status.state === "sync" && !passing){
      // Everything this device had to send has arrived: in step, with the
      // time. Files held back by a failure leave it at "home", counted.
      var all = sent > 0 && left === 0;
      setStatus({ state:all ? "ok" : "home", waiting:left, at:all ? Date.now() : 0 });
    }
  }

  // One flush at a time in this tab, and - through the lock - in the browser.
  // A call made while one runs gets another run after it.
  var flushing = null, again = false;
  function flush(){
    if(flushing){ again = true; return flushing; }
    var L = navigator.locks;
    var run = L && typeof L.request === "function"
      ? L.request("scula-nas:flush", { ifAvailable:true }, function(lock){ return lock ? runFlush() : null; })
      : runFlush();
    flushing = Promise.resolve(run).catch(noop).then(function(){
      flushing = null;
      if(again){ again = false; return flush(); }
    });
    return flushing;
  }
  function flushSoon(){ Promise.resolve().then(flush); }

  // What waits, for the sheet and for pages: oldest first.
  function outbox(){
    return entries().then(function(list){
      var total = 0;
      var files = list.map(function(e){
        total += e.size;
        return { id:e.id, page:e.subdir, directories:e.dirs.slice(), name:e.name, size:e.size, type:e.type,
                 created:e.created, tries:e.tries || 0, error:e.error || "" };
      });
      return { files:files, bytes:total };
    }, function(){ return { files:[], bytes:0 }; });
  }
  function entry(id){
    return dbTx(OUTBOX, "readonly", function(t){ return t.objectStore(OUTBOX).get(id); });
  }
  // "Save it another way": the ordinary route of this page, with no copy
  // queued again. The file keeps waiting for the NAS until it is removed.
  function saveQueued(id){
    var F = window.ScuLaFolder;
    return entry(id).then(function(e){
      if(!e) return { ok:false, message:tx("outGone") };
      return bodyOf(e).then(function(b){
        return F.save(e.name, b.slice(0, b.size, e.type), { nas:false, quiet:true, directories:e.dirs });
      }).then(function(r){
        var ok = !!r && (r.saved === true || r.via === "download" || r.pending === true || r.cancelled === true);
        return { ok:ok, message:r && r.message ? r.message : ok ? "" : tx("outSaveFailed") };
      });
    }).catch(function(err){
      return { ok:false, message:tx(err && err.message === "lost" ? "errLost" : "outSaveFailed") };
    });
  }
  function removeQueued(id){
    return entry(id).then(function(e){
      if(!e) return { ok:false, message:tx("outGone") };
      return dropEntry(e).then(function(){
        return changed().then(function(){ return { ok:true, message:tx("outRemoved")(e.name) }; });
      });
    }).catch(function(){ return { ok:false, message:tx("outGone") }; });
  }

  /* ---- sync passes ---- */

  // A page's two-way pass (the chapters, on index.html) runs through here:
  // only at home, one at a time per kind in the whole browser, with the
  // button showing it. Resolves { ran:true, value } - what `work(store)`
  // resolved - or { ran:false, why:"off" | "away" | "busy" }, and rejects
  // when `work` does. A `quiet` pass leaves the button alone: the calendar's,
  // which runs on every page and mostly finds nothing to do.
  var passing = 0;
  function pass(kind, work, quiet){
    return probe().then(function(p){
      if(!nas) return { ran:false, why:"off" };
      if(!p.home) return { ran:false, why:"away" };
      var store = folderStore(nas.handle, nas.storeId);
      function run(){
        if(quiet){
          return Promise.resolve().then(function(){ return work(store); }).then(function(value){
            return { ran:true, value:value };
          });
        }
        passing++;
        setStatus({ state:"sync", waiting:status.waiting });
        return Promise.resolve().then(function(){ return work(store); }).then(function(value){
          passing--;
          // In step, with the time - unless files still wait for the NAS.
          if(presence.home && !passing){
            setStatus(status.waiting > 0 ? { state:"home", waiting:status.waiting }
                                         : { state:"ok", waiting:0, at:Date.now() });
          }
          return { ran:true, value:value };
        }, function(err){
          passing--;
          if(presence.home && !passing && status.state === "sync") setStatus({ state:"home", waiting:status.waiting });
          throw err;
        });
      }
      var L = navigator.locks;
      if(!L || typeof L.request !== "function") return run();
      return L.request("scula-nas:pass:" + kind, { ifAvailable:true }, function(lock){
        return lock ? run() : { ran:false, why:"busy" };
      });
    });
  }

  /* ---- the calendar: one file, both ways ---- */

  // The events of ScuLaCal - every page carries them - and
  // <NAS folder>/calendar/events.json are brought in step from whichever
  // page is open:
  //
  //   { v, store, events:[ …as the store keeps them, Google's shape… ],
  //     deleted:{ id: when } }
  //
  // The comparing is ScuLaCal.mergeState() in the nav block, inside the
  // store's own write: per id the newest `updated` wins, and a deletion
  // travels as a tombstone. Here: the file is checked as a whole before a
  // word of it is believed, it is read again immediately before it is
  // replaced (temporary name, rename, read back - the store), and it is
  // written only when it would change. An event missing from the file is
  // sent again, never deleted here. A write that takes something out of
  // the file - an event deleted, or replaced by a newer one - first copies
  // the file as it stood into .scula-trash/<date>/calendar/, so nothing on
  // the NAS is destroyed. There is no lock: the merge gives the
  // same answer in any order, so a write that another device overwrote at
  // that instant is simply sent again by the next pass.
  var CAL_PATH = ["calendar", "events.json"], CAL_FORMAT = 1, CAL_ROUNDS = 4, CAL_WAIT = 1000;
  var TRASH = ".scula-trash";   // the chapter pass's, js/markdown/nassync.js
  var calError = "";            // "calBad" | "calNewer" while the file on the NAS cannot be used

  function calId(id){ return typeof id === "string" && id.length > 0 && id.length <= 1024; }
  function calStamp(e){ var n = Date.parse(e && e.updated); return n > 0 ? n : 0; }
  // An event as the file may carry it. One that is not stays on its device.
  function calEvent(e){
    if(!e || typeof e !== "object" || Array.isArray(e) || !calId(e.id)) return false;
    if(e.updated !== undefined && !(typeof e.updated === "string" && isFinite(Date.parse(e.updated)))) return false;
    var s = e.start;
    if(!s || typeof s !== "object") return false;
    return typeof s.date === "string" ? /^\d{4}-\d{2}-\d{2}$/.test(s.date)
      : typeof s.dateTime === "string" && isFinite(Date.parse(s.dateTime));
  }
  // The file -> { events, deleted }, or a throw that stops the pass.
  function calParse(text, id){
    var o = null, seen = Object.create(null), k;
    try{ o = JSON.parse(text); }catch(e){}
    var ok = !!o && typeof o === "object" && !Array.isArray(o);
    if(ok && typeof o.v === "number" && o.v > CAL_FORMAT) throw new Error("calNewer");
    ok = ok && o.v === CAL_FORMAT && o.store === id && Array.isArray(o.events) &&
      !!o.deleted && typeof o.deleted === "object" && !Array.isArray(o.deleted);
    ok = ok && o.events.every(function(e){
      if(!calEvent(e) || seen[e.id]) return false;
      seen[e.id] = 1;
      return true;
    });
    if(ok) for(k in o.deleted) if(!(typeof o.deleted[k] === "number" && o.deleted[k] > 0 && isFinite(o.deleted[k]))) ok = false;
    if(!ok) throw new Error("calBad");
    return { events:o.events, deleted:o.deleted };
  }
  // The same state gives the same bytes on every device: ids in order.
  function calText(st, id){
    var dead = Object.create(null), evs = st.events.filter(calEvent);
    Object.keys(st.deleted).sort().forEach(function(k){ dead[k] = st.deleted[k]; });
    evs.sort(function(a, b){ return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    if(!evs.length && !Object.keys(st.deleted).length) return "";
    return JSON.stringify({ v:CAL_FORMAT, store:id, events:evs, deleted:dead }, null, 1) + "\n";
  }
  // One line of a chapter scraped on two devices before they met is two
  // events with one sculaKey (ScuLaCal.syncSource()). The older id stays;
  // the other is deleted, dated so that its own stamp cannot outlive it.
  function calTwins(events){
    var first = Object.create(null), dead = {}, n = 0, now = Date.now();
    events.forEach(function(e){
      var p = e.extendedProperties && e.extendedProperties.private;
      if(!p || !p.sculaSource || !p.sculaKey) return;
      var k = p.sculaSource + "\n" + (p.sculaRef || "") + "\n" + p.sculaKey, f = first[k];
      if(!f){ first[k] = e; return; }
      var lose = e.id < f.id ? f : e;
      if(lose === f) first[k] = e;
      dead[lose.id] = Math.max(now, calStamp(lose) + 1);
      n++;
    });
    return n ? dead : null;
  }

  // Does the state hold every event of the file, as the file has it?
  function calKeeps(st, theirs){
    var now = Object.create(null);
    st.events.forEach(function(e){ now[e.id] = JSON.stringify(e); });
    return theirs.events.every(function(e){ return now[e.id] === JSON.stringify(e); });
  }
  function calDay(){
    var d = new Date(), two = function(n){ return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }

  var calMerging = false;
  async function calMerge(theirs){
    calMerging = true;      // what the merge changes here is not a reason to sync again
    try{ return await window.ScuLaCal.mergeState(theirs); }
    finally{ calMerging = false; }
  }
  async function calPass(store){
    var took = 0, lost = 0;
    for(var round = 0; round < CAL_ROUNDS; round++){
      var got = await store.read(CAL_PATH), text = got ? await got.blob.text() : "";
      // (An empty file is a write cut short, nobody's calendar: as if absent.)
      var theirs = text ? calParse(text, store.id) : null;
      var st = await calMerge(theirs);
      took += st.took; lost += st.lost;
      var twins = calTwins(st.events);
      if(twins){ st = await calMerge({ deleted:twins }); lost += st.lost; }
      var out = calText(st, store.id);
      if(out === text) return { took:took, lost:lost, sent:false };
      // Read again immediately before the write: what another device put
      // there meanwhile is merged first, not overwritten.
      var again = await store.read(CAL_PATH);
      if((again ? await again.blob.text() : "") !== text) continue;
      if(!out) return { took:took, lost:lost, sent:false };    // (nothing here, and a file that holds nothing: left)
      // (A copy that is already there - a pass cut short after it - is not made twice.)
      if(theirs && !calKeeps(st, theirs)) await store.copy(CAL_PATH, [TRASH, calDay(), CAL_PATH[0], CAL_PATH[1]]);
      await store.write(CAL_PATH, new Blob([out], { type:"application/json" }));
      return { took:took, lost:lost, sent:true };
    }
    throw new Error("changed");
  }

  // The file cannot be used ("calBad", "calNewer") or can again (""): the
  // button says so, on every page, until a pass reads a good one.
  function calFail(key){
    if(key === calError) return;
    calError = key;
    var s = status.state;
    if(presence.home && !passing && (s === "home" || s === "ok" || s === "error")){
      setStatus({ state:"home", waiting:status.waiting });
    }
  }

  // One calendar pass at a time in this tab (and, through pass(), in the
  // browser); a call made while one runs gets another run after it.
  // Resolves { ran:true, took, lost, sent } - events replaced and removed
  // here, and whether the file was written - or { ran:false, why }: "off",
  // "away", "busy" (another tab is at it), "error" (with `error`: "calBad",
  // "calNewer", or a passing trouble that the next pass tries again).
  var calRunning = null, calAgain = false, calTimer = 0;
  function calSync(){
    var C = window.ScuLaCal;
    if(!C || typeof C.mergeState !== "function") return Promise.resolve({ ran:false, why:"off" });
    if(calRunning){ calAgain = true; return calRunning; }
    calRunning = pass("calendar", calPass, true).then(function(r){
      if(!r.ran) return r;
      calFail("");
      var v = r.value;
      // Something travelled: in step, with the time - as after a chapter pass.
      if((v.took || v.lost || v.sent) && presence.home && !passing && status.state !== "sync"){
        setStatus(status.waiting > 0 ? { state:"home", waiting:status.waiting } : { state:"ok", waiting:0, at:Date.now() });
      }
      return { ran:true, took:v.took, lost:v.lost, sent:v.sent };
    }, function(err){
      var m = (err && err.message) || "";
      if(m === "calBad" || m === "calNewer") calFail(m);
      return { ran:false, why:"error", error:m };
    }).then(function(r){
      calRunning = null;
      if(calAgain){ calAgain = false; calSoon(); }
      return r;
    });
    return calRunning;
  }
  function calSoon(){
    clearTimeout(calTimer);
    calTimer = setTimeout(calSync, CAL_WAIT);
  }
  // An event saved or deleted on this device - in this tab or another one -
  // goes to the NAS a moment later, while the device is home.
  if(window.ScuLaCal && typeof window.ScuLaCal.onChange === "function"){
    window.ScuLaCal.onChange(function(){
      if(!calMerging && nas && presence.home && document.visibilityState === "visible") calSoon();
    });
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
  var draft = null;         // the address typed but not kept yet
  var howOpen = null;       // the steps for this device and for the other systems, as the
  var otherOpen = null;     // person last left them: true, false, or null for untouched
  var notice = null;        // { text, bad, invalid } shown under the address
  var folderNote = null;    // { text, bad } shown under the folder buttons
  var busy = false;         // a folder or queue action is running
  var persistNote = "";
  var confirming = 0;       // the waiting file whose removal is being confirmed
  var outNote = null;       // { text, bad } shown under the waiting files
  var outFocus = "";        // the control to focus once the list is painted

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
    "#scula-nas .link{display:flex;flex-wrap:wrap;align-items:center;column-gap:6px;min-height:44px;}",
    "#scula-nas ul{margin:0 0 12px;padding:0;list-style:none;}",
    "#scula-nas li{position:relative;margin:0 0 8px;padding-left:22px;font-size:13px;line-height:1.5;",
    "color:#9FB3A5;word-break:break-word;}",
    "#scula-nas li::before{position:absolute;left:0;top:0;color:#9FB3A5;content:\"•\";}",
    "#scula-nas li.yes::before{content:\"✓\";color:#C1BB45;}",
    "#scula-nas li.no::before{content:\"✕\";color:#F3EEE1;}",
    "#scula-nas li.no{color:#F3EEE1;}",
    "#scula-nas ol{margin:0 0 12px;padding:0 0 0 22px;}",
    "#scula-nas ol li{padding-left:2px;list-style:decimal;color:#F3EEE1;}",
    "#scula-nas ol li::before,#scula-nas li.os::before{content:none;}",
    "#scula-nas li.os{padding-left:0;}",
    "#scula-nas li.os strong{display:block;font-weight:600;color:#F3EEE1;}",
    "#scula-nas .warn{margin:0 0 12px;padding:10px 12px;border:1px solid #C1BB45;border-radius:10px;}",
    "#scula-nas .warn p{margin:0;color:#F3EEE1;}",
    "#scula-nas details{margin:0 0 12px;}",
    "#scula-nas summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:13px;color:#F3EEE1;}",
    "#scula-nas li.file{margin:0 0 14px;padding-left:0;color:#F3EEE1;}",
    "#scula-nas li.file::before{content:none;}",
    "#scula-nas li.file strong{display:block;font-weight:600;word-break:break-all;}",
    "#scula-nas li.file .err{color:#C1BB45;}",
    "#scula-nas .row{display:flex;flex-wrap:wrap;gap:8px;}",
    "#scula-nas .row .act{flex:1 1 130px;width:auto;margin-top:8px;}",
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
    card.appendChild(folderBox());
    if(keep.indexOf("nasOut") === 0 && !outFocus) outFocus = keep;
    card.appendChild(outboxBox());

    card.appendChild(howBox());
    card.appendChild(addressBox());

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
    if(notice && notice.invalid){
      var bad = sheet.querySelector("#nasAddr");
      if(bad){ bad.setAttribute("aria-invalid", "true"); bad.setAttribute("aria-errormessage", "nasMsg"); }
    }
    if(keep){ var back = sheet.querySelector("#" + keep); if(back) back.focus(); }
    paintDiagnosis(list, extra, card);
  }

  // One folder action: runs once at a time, then says what happened.
  function action(id, label, quiet, run){
    var b = el("button", "act" + (quiet ? " quiet" : ""), label);
    b.id = id; b.type = "button";
    b.addEventListener("click", function(){
      if(busy) return;
      busy = true;
      run().then(function(r){
        busy = false;
        if(r && r.cancelled) return;
        folderNote = r && r.message ? { text:r.message, bad:!r.ok } : null;
        render();
        var again = sheet.querySelector("#" + id) || sheet.querySelector("#nasPick") || sheet.querySelector("#nasClose");
        if(again) again.focus();
      });
    });
    return b;
  }

  // The first eight characters of a folder's identity, as a code a person
  // can compare between two devices: the path of a chosen folder cannot be
  // read, its identity file can.
  function codeOf(id){ return id.slice(0, 4) + "-" + id.slice(4, 8); }

  // The NAS folder: which one, where the note says it lies, its code, why
  // it is away, and the buttons that choose, reopen, release and forget it.
  // This is the only thing sync goes by; the address further down is a note.
  function folderBox(){
    var box = el("div");
    box.id = "nasFolderBox";
    box.appendChild(el("h3", "", tx("folderTitle")));
    var name = el("p", nas ? "state" : "", nas ? tx("folderIs")(nas.name) : tx("folderNone"));
    name.id = "nasFolderName";
    box.appendChild(name);
    var clash = !!nas && presence.why === "clash";
    if(nas){
      var how = aligned();
      if(how === "same"){
        var at = el("p", "", tx("folderAt")(address.url));
        at.id = "nasFolderAt";
        box.appendChild(at);
      }
      var code = el("p", "", tx("folderCode")(codeOf(nas.storeId)));
      code.id = "nasFolderCode";
      box.appendChild(code);
      if(how === "other"){
        // The note names another folder than the one chosen: said where the
        // folder is shown, with the two ways out of it.
        var warn = el("div", "warn"), text = el("p", "", tx("mismatch")(address.folder, nas.name));
        warn.id = "nasMismatch";
        warn.setAttribute("role", "note");
        warn.appendChild(text);
        var fix = el("button", "act quiet", tx("fixAddr"));
        fix.id = "nasFixAddr"; fix.type = "button";
        fix.addEventListener("click", function(){
          var i = sheet.querySelector("#nasAddr");
          if(!i) return;
          i.focus();
          i.select();
          if(typeof i.scrollIntoView === "function") i.scrollIntoView({ block:"center" });
        });
        warn.appendChild(fix);
        warn.appendChild(action("nasSame", tx("sameFolder"), true, confirmSame));
        box.appendChild(warn);
      }
    }
    if(nas && !presence.home){
      // (A clash and a missing permission are already the state line above.)
      var why = presence.why === "other" ? tx("whyOther")
        : presence.why === "gone" || presence.why === "timeout" ? tx(platform() === "Android" ? "whyGoneAndroid" : "whyGone") : "";
      if(why){
        var w = el("p", "", why);
        w.id = "nasWhy";
        box.appendChild(w);
      }
    }
    var can = typeof window.showDirectoryPicker === "function";
    if(!can && !nas) box.appendChild(el("p", "", tx("pickerNo")));
    if(nas && status.state === "ask") box.appendChild(action("nasGrant", tx("grant"), false, function(){
      return regrant().then(function(ok){ return { ok:ok, message:ok ? "" : tx("denied") }; });
    }));
    if(pending || clash) box.appendChild(action("nasRelease", tx("release"), false, release));
    if(can) box.appendChild(action("nasPick", tx(nas ? "pickOther" : "pick"), !!nas, pickFolder));
    if(nas) box.appendChild(action("nasForget", tx("forget"), true, forgetFolder));
    var msg = el("p", "msg" + (folderNote && folderNote.bad ? " bad" : ""), folderNote ? folderNote.text : "");
    msg.id = "nasFolderMsg";
    msg.setAttribute("role", "status");
    box.appendChild(msg);
    return box;
  }

  function age(ms){
    var min = Math.floor(Math.max(0, Date.now() - ms) / 60000);
    if(min < 1) return tx("ageNow");
    if(min < 60) return tx("ageMin")(min);
    if(min < 1440) return tx("ageHours")(Math.floor(min / 60));
    return tx("ageDays")(Math.floor(min / 1440));
  }

  // One button of a waiting file. `run` resolves { ok, message }.
  function outAction(id, label, name, run){
    var b = el("button", "act quiet", label);
    b.id = id; b.type = "button";
    b.setAttribute("aria-label", label + ": " + name);
    b.addEventListener("click", function(){
      if(busy) return;
      busy = true;
      run().then(function(r){
        busy = false;
        confirming = 0;
        outNote = r && r.message ? { text:r.message, bad:!r.ok } : null;
        outFocus = id;
        render();
      });
    });
    return b;
  }

  // The waiting files: where saved files go, how many wait and how much
  // room they take, and for each one "save it another way" and "remove".
  // Painted once the queue has been read; empty and hidden on a device with
  // no NAS folder and nothing waiting.
  function outboxBox(){
    var box = el("div"), mine = card;
    box.id = "nasOutbox";
    box.hidden = true;
    Promise.all([outbox(), diagnose().catch(function(){ return { free:null }; })]).then(function(v){
      var o = v[0], d = v[1], F = window.ScuLaFolder, n = o.files.length;
      if(card !== mine) return;               // the sheet was repainted meanwhile
      if(!nas && !n) return;
      box.hidden = false;
      box.appendChild(el("h3", "", tx("outTitle")));
      if(!nas || presence.why !== "clash"){
        var route = el("p", "", !nas ? tx("outOff") : tx("routeAlso"));
        route.id = "nasRouteLine";
        box.appendChild(route);
      }
      var total = el("p", "state", n ? tx("outTotal")(n, bytes(o.bytes)) + (d.free !== null ? tx("outFree")(bytes(d.free)) : "") : tx("outNone"));
      total.id = "nasOutTotal";
      box.appendChild(total);
      // Before the queue fills what is left: it already holds four fifths of
      // the room it can have, or the device is nearly full whatever it holds.
      if(d.free !== null && ((n && o.bytes >= 4 * d.free) || (nas && d.free < LOW_SPACE))){
        var warn = el("p", "msg bad", tx("outWarn"));
        warn.id = "nasOutWarn";
        box.appendChild(warn);
      }
      if(n){
        var ul = el("ul");
        ul.id = "nasOutList";
        o.files.slice(0, LISTED).forEach(function(file){
          var li = el("li", "file");
          li.setAttribute("data-id", String(file.id));
          li.appendChild(el("strong", "", file.directories.concat(file.name).join("/")));
          li.appendChild(el("small", "", (PAGE[file.page] || file.page) + " · " + bytes(file.size) + " · " + age(file.created)));
          if(file.error) li.appendChild(el("small", "err",
            file.error === "lost" ? tx("errLost") : file.error === "full" ? tx("errFull")
            : file.error === "denied" ? tx("errDenied") : tx("errFailed")(file.tries)));
          var row = el("div", "row");
          if(confirming === file.id){
            li.appendChild(el("small", "", tx("outAsk")));
            row.appendChild(outAction("nasOutYes-" + file.id, tx("outYes"), file.name, function(){ return removeQueued(file.id); }));
            var no = el("button", "act quiet", tx("outNo"));
            no.id = "nasOutNo-" + file.id; no.type = "button";
            no.addEventListener("click", function(){ confirming = 0; outFocus = "nasOutRemove-" + file.id; render(); });
            row.appendChild(no);
          } else {
            if(F && typeof F.save === "function" && file.error !== "lost"){
              row.appendChild(outAction("nasOutSave-" + file.id, tx("outSave"), file.name, function(){ return saveQueued(file.id); }));
            }
            var rm = el("button", "act quiet", tx("outRemove"));
            rm.id = "nasOutRemove-" + file.id; rm.type = "button";
            rm.setAttribute("aria-label", tx("outRemove") + ": " + file.name);
            rm.addEventListener("click", function(){ confirming = file.id; outNote = null; outFocus = "nasOutYes-" + file.id; render(); });
            row.appendChild(rm);
          }
          li.appendChild(row);
          ul.appendChild(li);
        });
        box.appendChild(ul);
        if(n > LISTED){
          var more = el("p", "", tx("outMore")(n - LISTED));
          more.id = "nasOutMore";
          box.appendChild(more);
        }
      }
      var msg = el("p", "msg" + (outNote && outNote.bad ? " bad" : ""), outNote ? outNote.text : "");
      msg.id = "nasOutMsg";
      msg.setAttribute("role", "status");
      box.appendChild(msg);
      // Where no 📁 folder is set: the way to choose one, or the share sheet
      // or a download, for the copy that stays on this device.
      if(nas && presence.why !== "clash" && F && typeof F.chooser === "function" && !F.isSet()){
        var where = el("button", "act quiet", tx("routeBtn"));
        where.id = "nasRoute"; where.type = "button";
        where.addEventListener("click", function(){ close(); F.chooser(); });
        box.appendChild(where);
      }
      if(outFocus){
        var back = box.querySelector("#" + outFocus) || box.querySelector("#nasOutList button") || sheet.querySelector("#nasClose");
        outFocus = "";
        if(back && sheet.classList.contains("open")) back.focus();
      }
    });
    return box;
  }

  // A list that folds. It opens as `open` says until the person folds or
  // unfolds it; `keep` remembers that across the repaints of the sheet.
  function foldable(id, label, open, keep){
    var d = el("details"), sum = el("summary", "", label);
    d.id = id;
    d.open = open;
    sum.addEventListener("click", function(){ keep(!d.open); });
    d.appendChild(sum);
    return d;
  }

  // How the NAS becomes a folder the chooser lists: the steps for this
  // device, with the names of the noted address where there is one, and the
  // other systems folded away. On a phone that is an app - Android's
  // chooser lists a NAS only when an app puts it there.
  var OS = { Android:"android", Windows:"windows", Mac:"mac", Linux:"linux" };
  var OS_NAME = { linux:"Linux", windows:"Windows", mac:"macOS", android:"Android" };
  function howBox(){
    var box = el("div"), here = OS[platform()] || "";
    var a = address || { generic:true, shareUrl:tx("anyShare"), unc:tx("anyUnc") };
    var btn = tx(nas ? "pickOther" : "pick");
    function steps(os){
      return os === "android" ? [tx("andApp"), tx("andConn")(a), tx("andPick")(a, btn)]
                              : [tx(os)(a), tx("deskPick")(a, btn)];
    }
    box.id = "nasHowBox";
    box.appendChild(el("h3", "", tx("howTitle")));
    if(here){
      // Open while connecting is what there is to do: no folder yet, or a
      // folder that does not answer. (A missing permission and a 📁 clash
      // have their own button above.)
      var todo = !nas || (!presence.home && presence.why !== "permission" && presence.why !== "clash");
      var mine = foldable("nasHowHere", tx("howHere")(OS_NAME[here]),
        howOpen === null ? todo : howOpen, function(v){ howOpen = v; });
      var ol = el("ol");
      ol.id = "nasSteps";
      ol.setAttribute("data-os", here);
      steps(here).forEach(function(text){ ol.appendChild(el("li", "", text)); });
      mine.appendChild(ol);
      if(here === "android"){
        var rule = el("p", "", tx("andRule"));
        rule.id = "nasRule";
        mine.appendChild(rule);
        mine.appendChild(el("p", "", tx("andAwake")));
        var get = el("p", "link"), app = el("a", "", tx("appLink"));
        app.id = "nasAppLink";
        app.href = SMB_APP_URL;
        app.target = "_blank";
        app.rel = "noopener noreferrer";
        get.appendChild(app);
        mine.appendChild(get);
      } else if(address){
        // A file manager opens an smb:// link and connects the share on the way.
        var p = el("p", "link"), link = el("a", "", address.url);
        link.id = "nasLink";
        link.href = address.url;
        link.setAttribute("aria-label", tx("openLink") + ": " + address.url);
        p.appendChild(el("span", "", tx("openLink") + ":"));
        p.appendChild(link);
        mine.appendChild(p);
      }
      box.appendChild(mine);
    }
    var others = foldable("nasHow", tx("howOther"), otherOpen === null ? !here : otherOpen, function(v){ otherOpen = v; });
    var ul = el("ul");
    ["linux", "windows", "mac", "android"].forEach(function(os){
      if(os === here) return;
      var li = el("li", "os");
      li.setAttribute("data-os", os);
      li.appendChild(el("strong", "", OS_NAME[os]));
      li.appendChild(document.createTextNode(steps(os).join(" ")));
      ul.appendChild(li);
    });
    others.appendChild(ul);
    box.appendChild(others);
    return box;
  }

  // The address of the sync folder, as a note: one field, and what keeping
  // it answered. It sits below the folder it describes and never above it.
  function addressBox(){
    var box = el("div");
    box.id = "nasAddrBox";
    box.appendChild(el("h3", "", tx("addrTitle")));
    var form = el("form");
    form.noValidate = true;
    form.appendChild(field("nasAddr", tx("addrLabel"), draft !== null ? draft : (address ? address.url : ""), EXAMPLE, tx("addrHint")));
    var save = el("button", "act", tx("save"));
    save.id = "nasSave"; save.type = "submit";
    form.appendChild(save);
    var msg = el("p", "msg" + (notice && notice.bad ? " bad" : ""), notice ? notice.text : "");
    msg.id = "nasMsg";
    msg.setAttribute("role", "status");
    form.appendChild(msg);
    form.addEventListener("input", function(){ draft = form.querySelector("#nasAddr").value; });
    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      var typed = form.querySelector("#nasAddr").value;
      setAddress(typed).then(function(r){
        // (An address that names another folder than the chosen one is kept,
        // and said in the colour of a warning; it is not an invalid address.)
        notice = { text:r.message, bad:!r.ok || !!r.other, invalid:!r.ok };
        // Kept: show what was stored (the password, if any, is gone from the
        // box too). Refused: leave what was typed for correcting.
        draft = r.ok ? null : typed;
        render();
        var again = sheet.querySelector("#nasAddr");
        if(!r.ok && again) again.focus();
      });
    });
    box.appendChild(form);
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
    draft = null; notice = null; persistNote = ""; folderNote = null; pending = null;
    confirming = 0; outNote = null; outFocus = "";
    howOpen = null; otherOpen = null;
    render();
    sheet.classList.add("open");
    // The focus goes to what there is to do - reopen or choose the folder -
    // and not to the address: on a phone a focused field raises the keyboard
    // over the very thing the sheet is opened to show.
    var first = sheet.querySelector("#nasGrant") || sheet.querySelector("#nasPick") || sheet.querySelector("#nasClose");
    if(first) first.focus();
    // Asking for the sheet is asking how things stand now.
    if(nas) probe();
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
    notice = null; persistNote = ""; folderNote = null; outNote = null;
    if(presence.why === "clash" || calError) applyPresence();   // their messages are sentences
    if(sheet && sheet.classList.contains("open")) render();
  });

  if(navBtn){
    paintButton();
    // "Needs a click": this click is the one. The sheet opens only if the
    // browser still refuses the folder.
    navBtn.addEventListener("click", function(){
      if(status.state === "ask" && nas) regrant().then(function(ok){ if(!ok) open(); });
      else open();
    });
  }

  window.ScuLaNas = {
    ready: ready,
    open: open,
    close: close,
    status: function(){
      return { state:status.state, waiting:status.waiting, at:status.at, error:status.error,
               home:presence.home === true, why:presence.home ? "" : presence.why };
    },
    // The remembered NAS folder ({ name, storeId }) or null. The handle
    // itself stays inside: pages reach the NAS through the store only.
    folder: function(){ return nas ? { name:nas.name, storeId:nas.storeId } : null; },
    // The file store of the NAS folder (see folderStore()), or null unless
    // the device is home. pass(kind, work) is how a page runs a sync pass
    // over it: at home only, one at a time, shown on the button.
    store: function(){ return nas && presence.home ? folderStore(nas.handle, nas.storeId) : null; },
    pass: pass,
    // The calendar pass, now: it also runs by itself on every page - at
    // home when the page opens or is looked at again, and after an event
    // is saved or deleted. See calSync() for what it resolves.
    syncCalendar: calSync,
    // Resolves { id, name }: this device, as a lock and a conflict copy name it.
    device: device,
    pickFolder: pickFolder,
    forgetFolder: forgetFolder,
    // Decides home or away now; resolves { home:true, id } or { home:false, why }.
    probe: probe,
    // The outbox. queue() is what ScuLaFolder.save() calls with every saved
    // file - (page subfolder, directories, name, Blob or { size, type,
    // stream() }) - and resolves { queued } without ever rejecting.
    // outbox() lists what waits: { files:[{ id, page, directories, name,
    // size, type, created, tries, error }], bytes }. flush() delivers what
    // is due now, if the device is home; it runs by itself as well.
    queue: queue,
    outbox: outbox,
    flush: flush,
    // The noted address of the sync folder, or null. `folder` is the name
    // it ends in ("" when it stops at the share), and `matches` says
    // whether that is the chosen folder: "same", "other", or "" when there
    // is nothing to compare.
    address: function(){
      return address ? { url:address.url, host:address.host, share:address.share,
                         path:address.path.slice(), folder:address.folder, matches:aligned() } : null;
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
