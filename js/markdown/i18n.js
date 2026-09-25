/* ============================================================
   i18n — pattern copied from voice.html, see docs/I18N.md.
   Not wrapped in an IIFE (unlike voice.html/editor.html): this
   file's markup calls its functions via inline onclick=, which
   requires them to stay global.
   ============================================================ */
const I18N = {
  ro:{
    newFileBtn:"Nou", openFileBtn:"Deschide .md", importDocxBtn:"Importă DOCX",
    exportHtmlBtn:"Exportă HTML",
    openHtmlBtn:"🌐 Deschide HTML", openHtmlTip:"Deschide o pagină HTML exportată din folderul ales cu 📁",
    openHtmlBlocked:"Fereastra a fost blocată — permite ferestrele pop-up pentru această pagină și încearcă din nou.",
    headingDefault:"— Titlu —", headingH1:"H1 — Titlu", headingH2:"H2 — Secțiune", headingH3:"H3 — Subsecțiune",
    undoBtn:"↶ Anulează", undoTip:"Anulează ultima modificare (Ctrl+Z)",
    redoBtn:"↷ Refă", redoTip:"Refă modificarea anulată (Ctrl+Shift+Z sau Ctrl+Y)",
    boldTip:"Aldin", italicTip:"Cursiv",
    listTip:"Listă neordonată", listBtn:"≡ Listă", orderedListTip:"Listă ordonată", orderedListBtn:"№ Ordonată",
    todoListTip:"Listă de sarcini", todoListBtn:"☐ De făcut", toggleTodoTip:"Marchează/demarchează ca terminat", toggleTodoBtn:"☑ Comută",
    taskStatusTip:"Alege starea sarcinii de la cursor sau a sarcinilor selectate",
    taskStatusDefault:"— Stare sarcină —", taskStatusTodo:"☐ De făcut", taskStatusInwork:"◐ În lucru",
    taskStatusOnhold:"Ⅱ În așteptare", taskStatusBlocked:"⛔ Blocată", taskStatusDone:"☑ Terminată",
    filterTaskStatusDefault:"— Toate stările —", filterTaskStatusTip:"Arată doar capitolele cu sarcini în starea aleasă",
    filterAllTodoBtn:"▣ Doar sarcini", filterAllTodoTip:"Arată doar capitolele cu o bifă neterminată („- [ ]”), din toate caietele, și în capitolul deschis doar liniile nebifate",
    // Importance markers. The *syntax* stays English (!nice / !important /
    // !vital) so a file reads the same in both languages — only the label
    // on the pill and in the select is translated.
    impTip:"Arată doar sarcinile cu importanța aleasă din toate caietele",
    impInsertTip:"Inserează un marcaj de importanță la cursor",
    impInsertDefault:"— Marcaje de importanță —",
    impInsertNice:"🌱 !nice", impInsertImportant:"⭐ !important", impInsertVital:"🔥 !vital",
    responsibleAll:"— Toți responsabilii —", responsibleTip:"Arată doar capitolele și rândurile atribuite responsabilului ales",
    impDefault:"— Toate importanțele —",
    impNiceOpt:"🌱 Bine de avut", impImportantOpt:"⭐ Important", impVitalOpt:"🔥 Vital",
    impNice:"Bine de avut", impImportant:"Important", impVital:"Vital",
    impFindTip:"Caută tot ce e marcat așa",
    lblSize:"Dimensiune", sizeDefault:"— Dimensiune font —",
    linkTip:"Inserează hyperlink (Ctrl+K)", linkBtn:"🔗 Link", imageBtn:"⬛ Imagine",
    textColorTip:"Culoarea textului selectat", highlightColorTip:"Evidențiază textul selectat",
    tableTip:"Inserează tabel", tableBtn:"⊞ Tabel",
    codeTip:"Inserează bloc de cod (Ctrl+Shift+K)", codeBtn:"⟨/⟩ Cod",
    timelineTip:"Inserează o cronologie (#dată - !ce s-a întâmplat)", timelineBtn:"⏳ Cronologie",
    timelineSeedText:"ce s-a întâmplat", timelineSeedLink:"o legătură", timelineSeedImage:"o poză",
    dictateTip:"Dictare vocală — folosește setările din Caiet vocal", dictateBtn:"🎤 Dictare",
    dictateListening:"Ascult…", dictateRecording:s=>`Înregistrez · ${s}`,
    dictateTranscribing:"Transcriu…", dictateTidying:"Corectez…",
    dictateNoSetup:"Configurează dictarea în pagina Caiet vocal (cheia API).",
    dictateNoMic:"Nu am acces la microfon.",
    dictateNoRecorder:"Reportofonul nu este disponibil în acest browser.",
    dictateNoLive:"Dictarea din browser nu este disponibilă aici.",
    dictateInsecure:"Dictarea are nevoie de HTTPS (sau localhost).",
    dictateNetwork:"Conexiune eșuată către serviciul de transcriere.",
    dictateTooBig:"Segmentul audio este prea mare.",
    dictateError:"Eroare la dictare:",
    explorerTip:"Explorator imagini", explorerBtn:"🖼 Explorator",
    navTip:"Navigare (Ctrl+1)", navBtn:"☰ Nav",
    toolbarToggleTip:"Arată/ascunde bara de unelte",
    tabSource:"✎ Sursă", tabPreview:"👁 Previzualizare",
    explorerTitle:"Explorator imagini", closePanelTip:"Închide panoul",
    setFolderBtn:"📁 Alege folder…", insertIntoEditorBtn:"↩ Inserează în editor",
    treeEmptyLine1:"Niciun folder selectat.", treeEmptyLine2:"Apasă „Alege folder” pentru a începe.",
    noFileChosen:"niciun fișier ales", chooseFileBtn:"⬛ Alege fișier…",
    paneSourceHeader:"Sursă Markdown", panePreviewHeader:"Previzualizare",
    editorPlaceholder:"Începe să scrii Markdown aici…\n\n# Salut, lume!\n## Un subtitlu\n\nScrie **aldin**, *cursiv*, sau folosește - pentru liste.\n\nFolosește bara de instrumente de mai sus pentru formatare.",
    navTitle:"Navigare", closeNavTip:"Închide (Ctrl+1)", noHeadingsYet:"Încă nu există titluri.",
    statWords:n=>`${n} cuvânt${n===1?'':'e'}`, statLines:n=>`${n} rând${n===1?'':'uri'}`, statChars:n=>`${n} caracter${n===1?'':'e'}`,
    modalTitleInsertImage:"Inserează imagine", lblImageUrl:"URL imagine sau cale fișier",
    lblOrPickComputer:"— sau alege de pe calculator —", lblAltText:"Text alternativ",
    imgAltPlaceholder:"O etichetă descriptivă", lblTitleOptional:"Titlu (indiciu opțional)",
    imgTitlePlaceholder:"Titlul imaginii", cancelBtn:"Anulează", insertBtn:"Inserează",
    pastedImageAlt:"imagine lipită",
    imagePasted:kb=>`Imagine adăugată în markdown (${kb} KB)`,
    imagePasteFailed:"Imaginea din clipboard nu a putut fi citită.",
    modalTitleInsertLink:"Inserează link", lblUrl:"URL", lblDisplayText:"Text afișat",
    linkTextPlaceholder:"Eticheta linkului", linkTitlePlaceholder:"Indiciu la trecerea cu mouse-ul",
    modalTitleTableBuilder:"Constructor tabel", lblRows:"Rânduri", lblColumns:"Coloane",
    noFsApi:"Browserul tău nu suportă File System Access API.\nFolosește Chrome, Edge, sau alt browser bazat pe Chromium.",
    confirmDiscard:"Renunți la conținutul curent?",
    mammothNotLoaded:"Mammoth.js nu s-a încărcat încă. Verifică-ți conexiunea la internet și încearcă din nou.",
    confirmReplace:"Înlocuiești conținutul curent cu documentul importat?",
    importFailed:msg=>`Import DOCX eșuat: ${msg}`,
    scanningFolder:"Se scanează folderul…", noImagesFound:"Nicio imagine găsită.", errorReadingFolder:"Eroare la citirea folderului.",
    /* ── Caiete și capitole (vezi docs/FEATURES.md § E) ── */
    workbooksBtn:"📓 Caiete", workbooksTip:"Caiete (Ctrl+2)", workbooksTitle:"Caiete",
    newWorkbookBtn:"＋ Caiet nou", syncFolderBtn:"⇩ Sincronizează în dosar",
    syncFolderTip:"Aduce caietele și capitolele noi din dosarul markdown și din Google Drive, apoi scrie fiecare capitol în dosar",
    saveToWorkbookBtn:"📓 Salvează capitolul în caiet", saveToWorkbookTip:"Salvează capitolul în caiet (Ctrl+S)",
    saveAllModifiedBtn:"📚 Salvează tot ce s-a modificat", saveAllModifiedTip:"Salvează fiecare capitol modificat din toate caietele (Ctrl+Alt+S)",
    wbEmpty:"Niciun caiet încă. Apasă „Caiet nou” ca să începi.",
    wbNoChapters:"niciun capitol încă",
    wbNoOpenTasks:"niciun capitol cu bifă neterminată",
    wbLocalOnly:"💾 salvat local (fără dosar)",
    filterTodoOnTip:"Arată doar capitolele cu o bifă neterminată („- [ ]”)",
    filterTodoOffTip:"Arată toate capitolele",
    addChapterTip:"Capitol nou", renameWorkbookTip:"Redenumește caietul", deleteWorkbookTip:"Șterge caietul",
    renameChapterTip:"Redenumește capitolul", exportChapterTip:"Exportă capitolul", deleteChapterTip:"Șterge capitolul",
    wbRenameHint:"Dublu-clic sau F2 pentru redenumire",
    moveWorkbookUpTip:"Mută caietul mai sus", moveWorkbookDownTip:"Mută caietul mai jos",
    moveChapterUpTip:"Mută capitolul mai sus", moveChapterDownTip:"Mută capitolul mai jos",
    promptNewWorkbook:"Numele caietului:", defaultWorkbookName:"Caiet nou",
    promptNewChapter:"Titlul capitolului:", defaultChapterName:"Capitol nou",
    promptRenameWorkbook:"Nume nou pentru caiet:", promptRenameChapter:"Titlu nou pentru capitol:",
    confirmDeleteWorkbook:n=>`Ștergi caietul „${n}” și toate capitolele lui?`,
    confirmDeleteChapter:n=>`Ștergi capitolul „${n}”?`,
    confirmLeaveUnsaved:"Textul curent nu e salvat în niciun caiet. Îl abandonezi?",
    untitledWorkbook:"caiet", untitledChapter:"capitol",
    workbookCreated:n=>`Caiet creat: ${n}`,
    chapterOpened:n=>`Capitol deschis: ${n}`,
    wbEditing:"se scrie…", wbAutosaved:"salvat automat",
    wbSavedTo:p=>`Salvat în ${p}`,
    wbSavedLocal:"Capitol salvat pe acest dispozitiv.",
    wbSynced:n=>`${n} capitol${n===1?'':'e'} scrise în dosar.`,
    wbAdopted:r=>`Găsite în dosar: ${r.books} caiet${r.books===1?'':'e'}, ${r.chapters} capitol${r.chapters===1?'':'e'}.`,
    wbNoModified:"Niciun capitol modificat.",
    wbSavedAllModified:n=>`${n} capitol${n===1?'':'e'} modificat${n===1?'':'e'} salvat${n===1?'':'e'}.`,
    wbSavedSomeModified:n=>`${n} capitol${n===1?'':'e'} salvat${n===1?'':'e'}; unele nu s-au putut scrie.`,
    wbStoreFailed:"Nu s-a putut salva local (IndexedDB indisponibil).",
    wbRestored:n=>`Reluat: ${n}`,
    wbRecovered:"Text recuperat: ce era pe ecran era mai nou decât ce era salvat.",
    wbDraftRestored:"Text nesalvat recuperat. Ctrl+S ca să intre într-un capitol.",
    looseTip:"Textul nu e într-un capitol — nu se salvează automat. Ctrl+S.",
    wbRemoved:"Șters.",
    modalTitleSaveWorkbook:"Salvează în caiet", lblWorkbook:"Caiet", lblNewWorkbookName:"Numele caietului nou",
    newWorkbookPlaceholder:"Notițe", lblChapter:"Capitol", lblChapterTitle:"Titlul capitolului",
    chapterTitlePlaceholder:"Capitolul 1", optNewWorkbook:"— caiet nou —", optNewChapter:"— capitol nou —",
    needWorkbookName:"Dă un nume caietului.", needChapterTitle:"Dă un titlu capitolului.",
    saveBtn:"Salvează", wbPathHint:p=>`Fișier: ${p}`,

    /* ── Sincronizare cu contul Google (docs/FEATURES.md § O) ── */
    cloudBtn:"☁ Cont Google", cloudBtnOn:"☁ Sincronizează acum",
    cloudTip:"Ține capitolele în contul tău Google, ca să le găsești în orice Chrome conectat la el",
    cloudTipOn:f=>`Sincronizează cu dosarul „${f}” din Google Drive (clic dreapta ca să te deconectezi)`,
    cloudOff:"☁ doar pe acest dispozitiv",
    cloudReady:"☁ conectat, încă nesincronizat",
    cloudAt:h=>`☁ sincronizat la ${h}`,
    cloudOpenTip:f=>`Deschide dosarul „${f}” în Google Drive`,
    cloudStale:"☁ conectarea a expirat — apasă din nou",
    cloudSyncing:"☁ se sincronizează…",
    cloudConnected:f=>`Cont Google conectat. Capitolele merg în „${f}”.`,
    cloudDone:r=>`Sincronizat: ${r.up} trimise, ${r.down} primite.`,
    cloudNothing:"Sincronizat — nimic de schimbat.",
    cloudSkipped:"Google Drive nu a fost conectat — nimic adus din cont.",
    cloudError:m=>`Google Drive: ${m}`,
    cloudNoFile:"Sincronizarea nu merge cu pagina deschisă direct de pe disc (file://). Deschide-o prin http(s) — de pe site, de exemplu — și încearcă din nou.",
    cloudForgetAsk:"Uiți conexiunea cu contul Google? Capitolele rămân și aici, și în Drive.",
    cloudForgot:"Cont Google deconectat.",

    /* ── Prima pornire pe un dispozitiv (docs/FEATURES.md § E) ── */
    welcomeTitle:"Bun venit",
    welcomeFolderDesktop:"Alege dosarul în care aplicația își ține fișierele pe acest dispozitiv. Caietele se scriu în subdosarul „markdown”, iar ce există deja acolo e preluat.",
    welcomeFolderMobile:"Browserul acestui telefon nu poate alege un dosar. Alege unde merg fișierele salvate — foaia de partajare sau descărcările. Capitolele rămân oricum în aplicație.",
    welcomeFolderBtn:"📁 Alege dosarul", welcomeFolderBtnMobile:"📁 Unde merg fișierele",
    welcomeLaterBtn:"Mai târziu",
    welcomeCloudText:"Vrei să aduci datele din cloud? Conectează contul tău Gmail: dacă în Google Drive există caiete salvate de pe alt dispozitiv, sunt aduse aici.",
    welcomeCloudFolder:f=>`Dosar ales: „${f}”. `,
    welcomeYesBtn:"☁ Da, conectează contul Google", welcomeNoBtn:"Nu, încep de la zero",
    welcomeCloudEmpty:"Contul Google e conectat, dar în Drive nu există încă niciun capitol.",

    /* ── Graful cunoștințelor (docs/FEATURES.md § G) ── */
    wikilinkBtn:"⟦⟧ Notiță", wikilinkTip:"Leagă o notiță sau o secțiune (Ctrl+Shift+L)",
    graphBtn:"🕸 Graf", graphTip:"Graful cunoștințelor (Ctrl+3)", graphTitle:"Graful cunoștințelor",
    scopeNote:"Notiță", scopeNoteTip:"Noțiunile din notița deschisă",
    scopeWorkbook:"Caiet", scopeWorkbookTip:"Capitolele caietului deschis",
    scopeVault:"Toate", scopeVaultTip:"Toate capitolele din toate caietele",
    gvSettingsBtn:"⚙ Setări", gvSettingsTip:"Filtre, grupuri, afișare, forțe",
    gvFitBtn:"⤢ Încadrează", gvFitTip:"Încadrează tot graful în ecran",
    gvCloseBtn:"✕ Închide", gvCloseTip:"Închide graful (Esc)",
    gvZoomInTip:"Mărește", gvZoomOutTip:"Micșorează",
    gvFilters:"Filtre", gvSearchPlaceholder:"Caută notițe…",
    gvTags:"Etichete", gvAttachments:"Atașamente", gvExistingOnly:"Doar notițe existente",
    gvOrphans:"Notițe fără legături", gvFocus:"Doar ce se leagă de notița curentă", gvDepth:"Adâncime",
    gvGroups:"Grupuri", gvGroupsHint:"Colorează fiecare nod al cărui nume, etichetă sau cale conține un cuvânt.",
    gvAddGroup:"＋ Grup nou", gvGroupPlaceholder:"cuvânt căutat", gvRemoveGroup:"Șterge grupul",
    gvDisplay:"Afișare", gvArrows:"Săgeți", gvTextFade:"Pragul de afișare a textului",
    gvNodeSize:"Mărimea nodurilor", gvLinkThickness:"Grosimea legăturilor",
    gvForces:"Forțe", gvCenterForce:"Forța de centrare", gvRepelForce:"Forța de respingere",
    gvLinkForce:"Forța legăturilor", gvLinkDistance:"Distanța legăturilor", gvResetForces:"↺ Resetează forțele",
    gvStats:([n,l])=>`${n} nod${n===1?'':'uri'} · ${l} legătur${l===1?'ă':'i'}`,
    gvLinksN:n=>`${n} legătur${n===1?'ă':'i'}`,
    gvEmpty:"Nimic de arătat încă. Scrie [[Nume]] ca să legi o notiță de alta, sau pune-i o #etichetă.",
    gvEmptySearch:"Niciun nod nu corespunde căutării.",
    gvEmptyWorkbook:"Deschide un capitol dintr-un caiet ca să vezi graful caietului.",
    gvAttachmentHint:p=>`Atașament: ${p}`,
    gvLegend_note:"notiță", gvLegend_active:"notița curentă", gvLegend_heading:"secțiune",
    gvLegend_block:"bloc", gvLegend_tag:"etichetă", gvLegend_unresolved:"inexistentă",

    /* ── Diagrama cauzalității (docs/FEATURES.md § M) ── */
    modeLinks:"🕸 Legături", modeLinksTip:"Notițe și legăturile dintre ele",
    modeCause:"⇄ Cauzalitate", modeCauseTip:"Cuvinte-cheie și ce pe ce influențează",
    gvLoopsOnly:"Doar ce intră într-o buclă", gvLoops:"Bucle de reacție",
    gvCauseHint:"Scrie o linie ca „stres -> insomnie -> stres”. -> înseamnă „mai mult”, -| înseamnă „mai puțin”, ~> un efect întârziat.",
    gvStatsCause:([n,l,c])=>`${n} ${n===1?'cuvânt':'cuvinte'} · ${l} ${l===1?'relație':'relații'} · ${c} ${c===1?'buclă':'bucle'}`,
    gvEmptyCause:"Nicio relație de cauzalitate încă. Scrie o linie ca „stres -> insomnie -| concentrare”.",
    gvLoopNone:"Nicio buclă închisă încă. O buclă apare când un lanț se întoarce de unde a plecat.",
    gvLoopR:"buclă care se amplifică (R)", gvLoopB:"buclă care se echilibrează (B)",
    gvCauseTip:([a,b,s])=>`${a} ${s} ${b}`,
    gvLegend_keyword:"cuvânt-cheie", gvLegend_causePos:"mai mult → mai mult",
    gvLegend_causeNeg:"mai mult → mai puțin", gvLegend_loopR:"buclă R (amplifică)",
    gvLegend_loopB:"buclă B (echilibrează)",
    modalTitleNoteLink:"Leagă o notiță", lblLinkTarget:"Țintă", lblAliasOptional:"Text afișat (opțional)",
    wikiFilterPlaceholder:"Filtrează notițe, secțiuni și blocuri…",
    wikiAliasPlaceholder:"Cum să se citească legătura",
    wikiThisNote:"notița aceasta", wikiLooseFile:"fișier liber",
    wikiNoCandidates:"Nu există încă nimic de legat.",
    wikiHint:m=>`Se inserează: ${m}`,
    wlUnresolvedTip:n=>`„${n}” nu există încă — apasă ca să o creezi`,
    wlAnchorMissing:a=>`Nu am găsit „${a}” în notiță.`,
    wlNoteCreated:n=>`Notița „${n}” a fost creată.`,
    confirmCreateNote:n=>`„${n}” nu există. O creezi ca un capitol nou?`,
    promptPickWorkbook:l=>`În ce caiet?\n\n${l}\n\nScrie numărul:`,
    /* ── Poze și filme dintr-un folder (docs/FEATURES.md § T) ── */
    mediaBtn:"📸 Poze", mediaTip:"Poze și filme dintr-un folder (Ctrl+6)",
    mediaTitle:"Poze și filme",
    mbPick:"📂 Alege folderul", mbPickTip:"Alege un folder și citește tot ce e în el, cu tot cu subfoldere",
    mbCsvBtn:"⇩ CSV", mbCsvTip:"Salvează ce e pe ecran ca fișier CSV",
    mbFormatLabel:"Scrie ca", mbKindLabel:"Arată",
    mbSearchPlaceholder:"Orice bucată din nume sau din folder…",
    mbFmtList:"Listă", mbFmtTimeline:"Cronologie", mbFmtTable:"Tabel",
    mbKindAll:"Tot", mbKindImg:"Doar poze", mbKindVid:"Doar filme",
    mbOptName:"Numele din denumirea fișierului", mbOptGeo:"Locul (^@) din GPS",
    mbOptLink:"Leagă fișierul", mbOptDay:"Un titlu pe zi",
    mbOptMeta:"Doar ce spun metadatele",
    mbColFile:"Fișier", mbColWhen:"Când", mbColSrc:"Sursa datei",
    mbColWhere:"Unde", mbColName:"Nume",
    mbSrc_meta:"metadate", mbSrc_name:"denumire", mbSrc_file:"fișier",
    mbNoDate:"fără dată", mbNoGeo:"fără GPS",
    mbNoFolder:"Alege un folder — pozele și filmele din el, cu tot cu subfoldere, ajung aici.",
    mbNoMatch:"Niciun fișier nu trece de filtrele de sus.",
    mbCount:a => a[0] + " din " + a[1],
    mbBreak:a => a[0] + " cu dată din metadate · " + a[1] + " cu GPS",
    mbScanning:a => "Citesc… " + a[0] + "/" + a[1],
    mbNothing:"Nu e nimic bifat de scris.",
    mbInserted:n => n + (n === 1 ? " rând scris în capitol" : " rânduri scrise în capitol"),
    mbInsertBtn:"↩ Pune în text", mbInsertTip:"Scrie rândurile bifate în capitol",
    /* ── Trusa de grădină (docs/FEATURES.md § N) ── */
    gardenBtn:"🌱 Grădina", gardenTip:"Trusa de grădină (Ctrl+5)", gardenTitle:"Trusa de grădină",
    gdTabAct:"🌾 Activități", gdTabActTip:"Tot ce s-a lucrat, cu durata și apa folosită",
    gdTabHarvest:"🧺 Recoltă", gdTabHarvestTip:"Ce s-a cules, pe plantă și pe loc",
    gdTabMow:"🌿 Cosit", gdTabMowTip:"De câte ori și câte ture s-a cosit în fiecare loc",
    gdScopeGarden:"Grădina", gdScopeGardenTip:"Toate caietele cu „grădină” în nume",
    gdFrom:"De la", gdTo:"Până la",
    gdPlaceLabel:"Loc", gdPlantLabel:"Plantă", gdCatLabel:"Activitate",
    gdGroupLabel:"Grupează după", gdSearchLabel:"Conține",
    gdSearchPlaceholder:"Orice cuvânt de pe rând…",
    gdAllPlaces:"Toate locurile", gdAllPlants:"Toate plantele", gdAllCats:"Toate activitățile",
    gdGroup_none:"Fără grupare", gdGroup_day:"Zi", gdGroup_month:"Lună",
    gdGroup_place:"Loc", gdGroup_plant:"Plantă", gdGroup_cat:"Activitate",
    gdCat_harvest:"Cules", gdCat_mow:"Cosit", gdCat_water:"Udat", gdCat_sow:"Semănat",
    gdCat_care:"Întreținere", gdCat_build:"Construit", gdCat_other:"Altele",
    gdColDate:"Data", gdColCat:"Activitate", gdColPlace:"Loc", gdColInterval:"Interval",
    gdColDuration:"Durată", gdColWater:"Apă", gdColDetail:"Rândul din caiet",
    gdColPlant:"Plantă", gdColQty:"Cantitate", gdColRounds:"Ture",
    gdColGroup:"Grup", gdColCount:"Înregistrări", gdColSessions:"Dăți",
    gdPieces:"buc",
    gdFootAct:a=>`${a.n} ${a.n===1?"activitate":"activități"} · ${a.dur} · ${a.litres} apă`,
    gdFootHarvest:a=>`${a.n} ${a.n===1?"recoltă":"recolte"} · ${a.qty}`,
    gdFootMow:a=>`${a.n} ${a.n===1?"cosire":"cosiri"} · ${a.rounds} ture`,
    gdUpTo:d=>`până la ${d}`, gdAllTime:"tot ce s-a scris",
    gdEmpty:"Nimic aici. Scrie o zi cu „@zz.ll.aaaa”, apoi rânduri ca „udat rand 5 in sm 06:02 - 06:30, 250 l apa” sau „cules din s1: 340 g vinete”.",
    gdReset:"↺ Resetează", gdResetTip:"Înapoi la tot, până azi",
    gdCsvBtn:"⇩ CSV", gdCsvTip:"Salvează tabelul de pe ecran ca fișier CSV",
    gdCloseBtn:"✕ Închide", gdCloseTip:"Închide trusa de grădină (Esc)",
    findBtn:"🔍 Caută", findTip:"Caută și filtrează (Ctrl+4)",
    findTitle:"Căutare și filtre", closeFindTip:"Închide (Ctrl+4)",
    findPlaceholder:"Caută în text…", findClearTip:"Golește căutarea",
    findScopeChapter:"Capitol", findScopeChapterTip:"Doar capitolul deschis în editor",
    findScopeWorkbook:"Caiet", findScopeWorkbookTip:"Toate capitolele acestui caiet",
    findScopeAll:"Tot", findScopeAllTip:"Toate capitolele din toate caietele",
    findCaseTip:"Ține cont de majuscule", findWordTip:"Doar cuvinte întregi",
    findRegexTip:"Expresie regulată", findFoldTip:"Ignoră diacriticele (a găsește ă, â)",
    findCtxTip:"Mai mult context în jurul fiecărei potriviri",
    findCollapseAllTip:"Restrânge toate rezultatele", findExpandAllTip:"Extinde toate rezultatele",
    findCollapseNoteTip:"Restrânge capitolul", findExpandNoteTip:"Extinde capitolul",
    findKindsLabel:"Doar", findTagsLabel:"Etichete",
    findKind_heading:"titluri", findKind_text:"text", findKind_list:"liste",
    findKind_code:"cod", findKind_quote:"citate", findKind_table:"tabele",
    findIdle:"Scrie ceva ca să cauți, sau alege o etichetă.",
    findNothing:"Nimic găsit.",
    findBadRegex:"Expresie regulată invalidă.",
    findLooseHint:"Documentul deschis nu e într-un caiet — se caută doar în el.",
    findEmptyScope:"Nu există capitole de căutat.",
    findLineNo:n=>`linia ${n}`,
    findOpenNoteTip:"Deschide capitolul",
    findFoot:o=>`${o.m===1?'o potrivire':o.m+' potriviri'} în ${o.n===1?'un capitol':o.n+' capitole'}`,
    findFootNotes:o=>`${o.n===1?'un capitol':o.n+' capitole'}`,

    /* Idee rapidă (Ctrl+Alt+I) — docs/FEATURES.md § J */
    ideaBtn:"💡 Idee", ideaTip:"Notează o idee direct în capitolul ei (Ctrl+Alt+I)",
    calSyncBtn:"📅 Trimite datele", calSyncTip:"Trimite fiecare „@dată” din toate caietele în calendar (Ctrl+Alt+D)",
    kanbanBtn:"▦ Kanban", kanbanTip:"Deschide panoul de sarcini pentru acest capitol",
    ganttBtn:"▤ Gantt", ganttTip:"Arată diagrama Gantt pentru sarcinile din acest capitol",
    ganttTitle:"Diagrama Gantt a capitolului", ganttHelp:"Pune #1 pe sarcina de care depind altele și $1 pe fiecare sarcină dependentă. Date: start@2026-09-24 și end@2026-09-30.",
    ganttTasks:"Sarcini", ganttEmpty:"Nu există sarcini în acest capitol. Adaugă o linie „- [ ]”.", ganttNoDate:"fără dată · afișată astăzi", ganttStart:"Început", ganttEnd:"Sfârșit", ganttDepends:"Depinde de", ganttMissing:n=>`Nu există o sarcină #${n} în acest capitol.`, ganttDuplicate:n=>`Marcajul #${n} apare pe mai multe sarcini.`,
    calSynced:([n, gone]) => (n === 1 ? "1 dată trimisă în calendar" : n + " date trimise în calendar") +
                             (gone ? ", " + gone + " șterse" : "") + ".",
    calNoDates:"Nicio „@dată” găsită. Scrie de exemplu @2026-09-03 14:00-15:30.",
    calOpen:"Deschide",
    mapBtn:"🗺 Hartă", mapTip:"Arată pe hartă locurile „^@” din capitolul acesta (Ctrl+Alt+M)",
    mapNone:"Niciun loc „^@” în capitolul acesta. Scrie de exemplu ^@Castelul Peleș.",
    modalTitleIdea:"Idee rapidă", lblIdea:"Idee",
    ideaPlaceholder:"Editor: - [ ] scrie cod care să…",
    ideaSaveBtn:"Trimite ideea", ideaSaveTip:"Trimite ideea (Ctrl+Enter)",
    ideaHintIdle:"Începe cu numele capitolului urmat de „:”. Fără el, ideea ajunge în Idei.",
    ideaHintTo:o=>`Ajunge în ${o.book} / ${o.chapter}`,
    ideaHintNew:o=>`Se creează ${o.book} / ${o.chapter}`,
    ideaHintFallback:o=>`Niciun capitol „${o.name}” — ideea ajunge în ${o.book} / ${o.chapter}`,
    ideaEmpty:"Scrie ideea mai întâi.",
    ideaSaved:o=>`Idee trimisă în ${o.book} / ${o.chapter}`,
    ideaSavedTo:o=>`Idee trimisă în ${o.book} / ${o.chapter} → ${o.path}`,
    ideaFailed:"Nu am putut salva ideea.",

    /* Help modal */
    helpBtn:"Ajutor", helpTip:"Ajutor", modalTitleHelp:"Ajutor — Editor Markdown", closeBtn:"Închide",
    helpBody:`
      <h3>Ce face pagina asta</h3>
      <p>Editorul Markdown ține notele în <b>caiete</b> cu <b>capitole</b> — un capitol e un fișier .md. Textul se scrie în stânga, previzualizarea apare în dreapta.</p>
      <h3>Dosarul de pe dispozitiv și sincronizarea cu norul</h3>
      <p>Cea mai importantă parte a paginii: unde ajung de fapt fișierele și cum rămân la fel pe toate dispozitivele.</p>
      <ul>
        <li>Butonul <b>📁</b> din bara de sus (sau „📁 Alege dosar…” din panoul Caiete) alege dosarul de pe disc unde se scriu caietele — pe calculator, un dosar adevărat; pe telefon, fișierele trec prin foaia de partajare a sistemului, pentru că niciun browser de telefon nu oferă o alegere de dosar. Fără un dosar ales, ce scrii rămâne doar în acest browser (localStorage) și se pierde dacă se șterg datele browserului.</li>
        <li><b>☁ Cont Google</b>, în bara de sus, conectează contul Google și sincronizează capitolele cu Google Drive — câte un fișier pentru fiecare capitol, într-un folder propriu în Drive. Un clic conectează, un clic din nou sincronizează oricând, clic dreapta deconectează contul. Funcționează doar cu pagina deschisă prin HTTP(S), nu direct ca fișier local.</li>
        <li><b>⇩ Sincronizează în dosar</b>, lângă „☁ Cont Google”, e cel mai important buton din pagină: citește dosarul de pe disc după caiete sau capitole adăugate acolo de mână (un folder nou devine caiet, un fișier .md nou devine capitol), aduce ce e nou din Google Drive, apoi scrie înapoi în dosar toate capitolele. Așa ajung pe un dispozitiv nou caietele scrise pe altul.</li>
        <li>La prima pornire pe un dispozitiv nou, o fereastră cere întâi dosarul, apoi întreabă dacă aduci datele din cloud — răspunde „Da” ca să tragi aici tot ce ai scris pe alt dispozitiv.</li>
      </ul>
      <h3>Caiete și capitole</h3>
      <ul>
        <li>Panoul „Caiete” (<kbd>Ctrl+2</kbd>) arată caietele și capitolele lor; dublu-click sau <kbd>F2</kbd> pe un nume îl redenumește pe loc.</li>
        <li>Trage un capitol ca să-l reordonezi în caiet sau să-l muți în alt caiet. Pe ecran tactil, ține apăsat pe capitol, apoi trage-l.</li>
        <li>Ce scrii se salvează automat pe măsură ce tastezi; „Salvează în caiet” (<kbd>Ctrl+S</kbd>) scrie și pe disc, dacă ai ales un folder cu 📁 din bara de sus.</li>
        <li>„📚 Salvează tot ce s-a modificat” (<kbd>Ctrl+Alt+S</kbd>) scrie odată toate capitolele modificate din toate caietele — un punct lângă un nume arată ce nu a fost încă scris pe disc.</li>
        <li>„⇩ Sincronizează în dosar”, lângă „☁ Cont Google” în bara de sus, preia caietele și capitolele noi din folderul markdown și din Google Drive, apoi scrie toate capitolele înapoi în acel folder. La prima pornire pe un dispozitiv nou, aplicația cere întâi dosarul, apoi întreabă dacă aduci datele din cloud.</li>
        <li>„☁ Cont Google” conectează și sincronizează capitolele cu Google Drive; apasă din nou pentru sincronizare, iar clic dreapta deconectează contul. Deschide pagina prin HTTP(S), nu direct ca <code>file://</code>, pentru această funcție.</li>
        <li>Un caiet cu „TODO” în nume capătă un buton ☑ care arată doar capitolele cu o sarcină nebifată; „▣ Doar sarcini” din bara de instrumente face același lucru pentru toate caietele, indiferent de nume, și arată în capitolul deschis doar liniile „- [ ]” nebifate — nu sarcinile terminate, nu restul textului.</li>
      </ul>
      <h3>Formatare</h3>
      <p>Bara de instrumente are bold, italic, titluri, liste, listă de sarcini, cod, tabel, imagine, link, dimensiune font, culoare text și evidențiere. Selectează textul și aplică dimensiunea, culoarea și evidențierea în orice combinație. Lipirea unei poze (<kbd>Ctrl+V</kbd>) o pune direct în text, ca imagine încorporată.</p>
      <h3>Legături [[wikilink]] și #etichete</h3>
      <ul>
        <li>Scrie <code>[[</code> pentru sugestii de notițe (↑↓ alege, Enter/Tab inserează, Esc renunță), sau folosește butonul ⟦⟧ Notiță / <kbd>Ctrl+Shift+L</kbd>.</li>
        <li><code>[[Notiță]]</code> deschide un capitol; <code>[[Notiță#Secțiune]]</code> sare la un titlu; <code>[[Notiță#^ancoră]]</code> sare la un bloc anume; <code>[[#Secțiune]]</code> leagă în interiorul notiței curente.</li>
        <li><code>![[imagine.png]]</code> încorporează o poză; <code>![[Notiță]]</code> devine un card ce deschide notița.</li>
        <li><code>#etichetă</code> marchează un cuvânt drept etichetă.</li>
        <li>O legătură către o notiță care nu există încă rămâne o legătură — apăsând pe ea se creează capitolul.</li>
      </ul>
      <h3>Graful de cunoștințe</h3>
      <p>Butonul „Graf” sau <kbd>Ctrl+3</kbd> arată notițele ca noduri legate — poți privi doar notița curentă, tot caietul sau tot ce ai scris. Panoul din stânga are Filtre, Grupuri, Afișare și Forțe.</p>
      <h3>Diagrama cauzalității</h3>
      <ul>
        <li>În graf, comutatorul „⇄ Cauzalitate” desenează cuvintele-cheie și ce pe ce influențează, în loc de notițe și legături.</li>
        <li>Scrie relația pe un rând singur: <code>stres -&gt; insomnie -&gt; stres</code>. <code>-&gt;</code> înseamnă „mai mult duce la mai mult”, <code>-|</code> înseamnă „mai mult duce la mai puțin”, iar <code>~&gt;</code> / <code>~|</code> marchează un efect care vine mai târziu.</li>
        <li>Un lanț care se închide e o buclă: <b>R</b> dacă se amplifică singură (cerc vicios sau virtuos), <b>B</b> dacă se echilibrează. Buclele sunt listate în panou — treci cu mouse-ul peste una ca s-o vezi pe desen, apasă ca s-o fixezi.</li>
        <li>Un cuvânt poate fi scris și ca <code>[[Notiță]]</code> sau <code>#etichetă</code> — diagrama ia cuvântul, previzualizarea păstrează legătura.</li>
      </ul>
      <h3>Trusa de grădină</h3>
      <p>Butonul 🌱 sau <kbd>Ctrl+5</kbd> citește caietul de grădină și scoate din el trei tabele. Scrii ziua ca <code>@22.07.2026</code> și dedesubt ce ai făcut, în limba ta:</p>
      <ul>
        <li><b>Activități</b> — un rând cu un interval devine o activitate cu durată: <code>udat rand 5 in sm 06:02 - 06:30, 250 l apa</code> → Udat, Solar mare, 28 m, 250 l. Litrii se numără doar când rândul spune că sunt apă, așa că „am rămas cu 60 l” nu intră la socoteală.</li>
        <li><b>Recoltă</b> — <code>cules din s1: 340 g vinete, 800 g ardei</code> dă un rând de fiecare plantă, în grame. Merge și scris invers (<code>zucchini 450 g</code>) și fără două puncte (<code>cules din sm 5,3 kg rosii</code>).</li>
        <li><b>Cosit</b> — <code>cosit 4 ture … din gg</code> sau <code>cosit 4 gn</code> numără dățile și turele, pe loc.</li>
      </ul>
      <p>Codurile locurilor (<code>sm</code>, <code>s1</code>, <code>s2</code>, <code>gg</code>, <code>gp</code>, <code>gn</code>, „solar mare”…) și numele plantelor sunt recunoscute cu tot cu sinonime; ce nu e în listă e păstrat așa cum l-ai scris. Filtrezi după dată, loc, plantă sau activitate, grupezi după zi / lună / loc / plantă, iar totalul de jos urmează filtrul — „Până la” pornește de la ziua de azi, deci e totalul de până acum. ⇩ CSV salvează exact ce vezi, iar un clic pe un rând te duce la el în text.</p>
      <h3>Poze și filme dintr-un folder</h3>
      <p>Butonul 📸 sau <kbd>Ctrl+6</kbd> deschide un folder — cu tot cu subfoldere — și citește din fiecare poză și fiecare film ce a scris aparatul în fișier: <b>când</b> a fost făcut și <b>unde</b>. Coloana „Sursa datei” spune de unde vine data: <b>metadate</b> (EXIF la poze, cutiile <code>moov</code> la filme), <b>denumire</b> (data din numele fișierului, când metadatele n-au niciuna) sau <b>fișier</b> (data de pe disc, ultima soluție).</p>
      <ul>
        <li><b>Numele din denumirea fișierului</b> — regula e „ce nu e dată și nu e ceas”: din <code>2024-07-12 Ana la mare.jpg</code> rămâne „Ana la mare”, din <code>IMG_20240712_153000.jpg</code> nu rămâne nimic, iar <code>Casa 12.png</code> își păstrează 12-le.</li>
        <li><b>Locul (^@) din GPS</b> — coordonatele devin un marcaj <code>^@44.4268, 26.1025</code>, deci intră direct pe <b>hartă</b> (🗺).</li>
        <li>Se scrie ca <b>listă</b> (un rând cu <code>@dată</code>, nume și fișier), ca <b>cronologie</b> (<code>#dată - !ce</code>) sau ca <b>tabel</b>. Bifa de pe fiecare rând hotărăște ce intră în text; ⇩ CSV salvează tot ce e pe ecran.</li>
      </ul>
      <h3>Căutare și filtrare</h3>
      <p>🔍 Find, <kbd>Ctrl+4</kbd> sau <kbd>Ctrl+Shift+F</kbd> deschide căutarea: capitol / caiet / tot ce ai scris, cu comutatoarele Aa (majuscule), ⌈ab⌉ (cuvinte întregi), .* (expresie regulată) și ăâ (ignoră diacriticele, activ implicit), plus filtre pe tipul liniei și pe etichete.</p>
      <p>Filtrele din bara de instrumente pot limita caietele și previzualizarea la un responsabil sau la sarcini cu importanța aleasă. „▣ Doar sarcini” păstrează numai liniile de sarcini nebifate.</p>
      <h3>Idee rapidă</h3>
      <p>Butonul 💡 sau <kbd>Ctrl+Alt+I</kbd> deschide o casetă: scrii „Nume capitol: idee” și textul ajunge acolo — sau, fără nume, în caietul „Idei”, la capitolul de azi. <kbd>Ctrl+Enter</kbd> trimite, <kbd>Esc</kbd> închide.</p>
      <h3>Marcaje de importanță</h3>
      <p><code>!nice</code> 🌱, <code>!important</code> ⭐, <code>!vital</code> 🔥 — din selectul din bară sau <kbd>Ctrl+Alt+1/2/3</kbd> (<kbd>Ctrl+Alt+0</kbd> șterge). Click pe pastilă caută tot ce mai are același marcaj.</p>
      <h3>Starea sarcinilor</h3>
      <p>O sarcină poate fi de făcut (<code>- [ ]</code>), în lucru (<code>- [ ] ~inwork</code>), în așteptare (<code>- [ ] ~onhold</code>), blocată (<code>- [ ] ~blocked</code>) sau terminată (<code>- [x]</code>). Alege starea din bara de instrumente pentru rândul de la cursor sau pentru sarcinile selectate. Bifa din previzualizare marchează sarcina ca terminată ori o readuce la „de făcut”.</p>
      <p>Butonul ▦ Kanban deschide capitolul curent ca panou de sarcini. Poți alege un capitol, un caiet sau toate caietele, apoi poți căuta, filtra și muta sarcinile între stări. Scrie <code>start@2026-09-24</code> sau <code>end@2026-09-30</code> în sarcină pentru a arăta începutul ori termenul.</p>
      <p>Butonul ▤ Gantt desenează sarcinile din capitolul curent pe zile, inclusiv modificările nesalvate. Pune <code>#1</code> pe o sarcină și <code>$1</code> pe cele care depind de ea; săgețile arată dependențele. Datele <code>start@</code> și <code>end@</code> stabilesc intervalul; o sarcină fără dată apare în ziua de azi. Apasă pe numele unei sarcini ca să ajungi la rândul ei în editor.</p>
      <h3>Responsabil</h3>
      <p><code>&gt;&gt;Nume</code> poate apărea oriunde în text, inclusiv în afara unei sarcini, pentru a marca un responsabil. Forma <code>Nume&gt;&gt; text</code> de la începutul rândului funcționează și ea.</p>
      <h3>Marcajul de dată @dată</h3>
      <p><code>@2026-09-03</code>, <code>@2026-09-03 14:00</code>, <code>@2026-09-03 14:00-15:30</code>, sau un interval de zile cu <code>..</code> — scris oriunde în text. 📅 „Trimite datele” sau <kbd>Ctrl+Alt+D</kbd> trimite toate marcajele către pagina Calendar.</p>
      <h3>Marcajul de loc ^@</h3>
      <p><code>^@Castelul Peleș</code>, <code>^@Strada Lipscani 12, București</code> sau <code>^@44.4268, 26.1025</code> — un nume, o adresă sau coordonate, scrise până la capătul rândului. După <code>|</code> poți adăuga o notă, iar un <code>#etichetă</code> încheie adresa și rămâne al rândului.</p>
      <p>Butonul 🗺 Hartă apare doar cât capitolul deschis are un <code>^@</code>; el (sau <kbd>Ctrl+Alt+M</kbd>) duce locurile pe pagina Hartă, așezate pe straturi după titlul de deasupra fiecăruia.</p>
      <h3>Cronologie</h3>
      <ul>
        <li>Un rând scris <code>#1969 - !Primul om pe Lună</code> e un reper: <code>#</code> deschide data, <code>!</code> deschide ce s-a întâmplat, iar <code>-</code> dintre ele le leagă.</li>
        <li>Rândurile puse unul sub altul sunt o singură cronologie — un desen SVG cu un punct pentru fiecare reper, așezat acolo unde îi cade data între prima și ultima, și lista de dedesubt, numerotată la fel.</li>
        <li>Data poate fi an, lună sau zi: <code>#1969</code>, <code>#2026-09</code>, <code>#2026-09-21</code>, <code>#21.09.2026</code>.</li>
        <li>După <code>!</code> scrii text, o poză — <code>![lună](luna.png)</code> — sau o legătură — <code>![Apollo 11](https://nasa.gov)</code>. Aceeași formă; unde duce spune ce e.</li>
        <li>Butonul ⏳ Cronologie din bară scrie trei rânduri peste care poți scrie ale tale.</li>
      </ul>
      <h3>Anulare / Refă</h3>
      <p><kbd>Ctrl+Z</kbd> anulează, <kbd>Ctrl+Shift+Z</kbd> sau <kbd>Ctrl+Y</kbd> reface — un istoric propriu al editorului, separat de cel al browserului, care ține pasul cu orice acțiune din bară.</p>
      <h3>Import / Export</h3>
      <p>„Import DOCX” aduce un Word ca markdown; „Export HTML” scrie o pagină de sine stătătoare, cu buton de copiere pe blocurile de cod. „🌐 Deschide HTML” deschide într-o filă nouă o pagină HTML exportată anterior.</p>
      <h3>Dictare vocală</h3>
      <p>Iconița 🎙 din bară transcrie vorbirea direct la cursor, folosind setările din pagina „Caiet vocal”.</p>
      <h3>Scurtături</h3>
      <p>
        <kbd>Ctrl+S</kbd> salvează în caiet · <kbd>Ctrl+Shift+S</kbd> exportă fișier · <kbd>Ctrl+Alt+S</kbd> salvează tot ce s-a modificat ·
        <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> / <kbd>Ctrl+Y</kbd> anulare/refă ·
        <kbd>Ctrl+B</kbd> bold · <kbd>Ctrl+I</kbd> italic · <kbd>Ctrl+K</kbd> link · <kbd>Ctrl+Shift+K</kbd> bloc de cod ·
        <kbd>Ctrl+Shift+1..6</kbd> titluri H1-H6 ·
        <kbd>Ctrl+Enter</kbd> / <kbd>Ctrl+Shift+Enter</kbd> rând gol după/înainte · <kbd>Alt+↑/↓</kbd> mută rândul ·
        <kbd>Ctrl+L</kbd> selectează rândul (apasă din nou pentru paragraf) ·
        <kbd>Ctrl+1</kbd> navigare · <kbd>Ctrl+2</kbd> caiete · <kbd>Ctrl+4</kbd> / <kbd>Ctrl+Shift+F</kbd> căutare · <kbd>Ctrl+3</kbd> graf · <kbd>Ctrl+5</kbd> grădină · <kbd>Ctrl+6</kbd> poze ·
        <kbd>Ctrl+Shift+L</kbd> legătură [[notiță]] ·
        <kbd>Ctrl+Alt+I</kbd> idee rapidă · <kbd>Ctrl+Alt+D</kbd> trimite datele în calendar · <kbd>Ctrl+Alt+M</kbd> hartă ·
        <kbd>Ctrl+Alt+1/2/3</kbd> importanță (<kbd>Ctrl+Alt+0</kbd> șterge) ·
        <kbd>F2</kbd> redenumește caietul/capitolul selectat · <kbd>Esc</kbd> închide fereastra deschisă.
      </p>
    `
  },
  en:{
    newFileBtn:"New", openFileBtn:"Open .md", importDocxBtn:"Import DOCX",
    exportHtmlBtn:"Export HTML",
    openHtmlBtn:"🌐 Open HTML", openHtmlTip:"Open an exported HTML page from the folder set with 📁",
    openHtmlBlocked:"Pop-up blocked — allow pop-ups for this page and try again.",
    headingDefault:"— Heading —", headingH1:"H1 — Title", headingH2:"H2 — Section", headingH3:"H3 — Sub-section",
    undoBtn:"↶ Undo", undoTip:"Undo the last change (Ctrl+Z)",
    redoBtn:"↷ Redo", redoTip:"Redo the undone change (Ctrl+Shift+Z or Ctrl+Y)",
    boldTip:"Bold", italicTip:"Italic",
    listTip:"Unordered List", listBtn:"≡ List", orderedListTip:"Ordered List", orderedListBtn:"№ Ordered",
    todoListTip:"To-do List", todoListBtn:"☐ Todo", toggleTodoTip:"Mark/unmark as done", toggleTodoBtn:"☑ Toggle Done",
    taskStatusTip:"Set the status of the task at the caret or selected tasks",
    taskStatusDefault:"— Task status —", taskStatusTodo:"☐ To do", taskStatusInwork:"◐ In work",
    taskStatusOnhold:"Ⅱ On hold", taskStatusBlocked:"⛔ Blocked", taskStatusDone:"☑ Done",
    filterTaskStatusDefault:"— All task states —", filterTaskStatusTip:"Show only chapters with tasks in the selected state",
    filterAllTodoBtn:"▣ Tasks only", filterAllTodoTip:"Show only chapters with an unchecked box (“- [ ]”), across every workbook, and in the open chapter only the unchecked lines",
    impTip:"Show only tasks with the selected importance across all workbooks",
    impInsertTip:"Insert an importance marker at the cursor",
    impInsertDefault:"— Importance markers —",
    impInsertNice:"🌱 !nice", impInsertImportant:"⭐ !important", impInsertVital:"🔥 !vital",
    responsibleAll:"— All responsibles —", responsibleTip:"Show only chapters and lines assigned to the selected responsible",
    impDefault:"— All importance —",
    impNiceOpt:"🌱 Nice to have", impImportantOpt:"⭐ Important", impVitalOpt:"🔥 Vital",
    impNice:"Nice to have", impImportant:"Important", impVital:"Vital",
    impFindTip:"Find everything marked this way",
    lblSize:"Size", sizeDefault:"— Font Size —",
    linkTip:"Insert hyperlink (Ctrl+K)", linkBtn:"🔗 Link", imageBtn:"⬛ Image",
    textColorTip:"Color selected text", highlightColorTip:"Highlight selected text",
    tableTip:"Insert table", tableBtn:"⊞ Table",
    codeTip:"Insert code block (Ctrl+Shift+K)", codeBtn:"⟨/⟩ Code",
    timelineTip:"Insert a timeline (#date - !what happened)", timelineBtn:"⏳ Timeline",
    timelineSeedText:"what happened", timelineSeedLink:"a link", timelineSeedImage:"a picture",
    dictateTip:"Voice dictation — uses the Caiet vocal settings", dictateBtn:"🎤 Dictate",
    dictateListening:"Listening…", dictateRecording:s=>`Recording · ${s}`,
    dictateTranscribing:"Transcribing…", dictateTidying:"Tidying up…",
    dictateNoSetup:"Set voice input up on the Caiet vocal page first (API key).",
    dictateNoMic:"No microphone access.",
    dictateNoRecorder:"Audio recording is not available in this browser.",
    dictateNoLive:"Browser dictation is not available here.",
    dictateInsecure:"Dictation needs HTTPS (or localhost).",
    dictateNetwork:"Could not reach the transcription service.",
    dictateTooBig:"The audio segment is too large.",
    dictateError:"Dictation error:",
    explorerTip:"Image Explorer", explorerBtn:"🖼 Explorer",
    navTip:"Navigation (Ctrl+1)", navBtn:"☰ Nav",
    toolbarToggleTip:"Show/hide toolbar",
    tabSource:"✎ Source", tabPreview:"👁 Preview",
    explorerTitle:"Image Explorer", closePanelTip:"Close panel",
    setFolderBtn:"📁 Set folder…", insertIntoEditorBtn:"↩ Insert into editor",
    treeEmptyLine1:"No folder selected.", treeEmptyLine2:"Click “Set folder” to begin.",
    noFileChosen:"no file chosen", chooseFileBtn:"⬛ Choose file…",
    paneSourceHeader:"Markdown Source", panePreviewHeader:"Preview",
    editorPlaceholder:"Start writing Markdown here…\n\n# Hello, World!\n## A subtitle\n\nWrite **bold**, *italic*, or use - for lists.\n\nUse the toolbar above to insert formatting.",
    navTitle:"Navigation", closeNavTip:"Close (Ctrl+1)", noHeadingsYet:"No headings yet.",
    statWords:n=>`${n} word${n!==1?'s':''}`, statLines:n=>`${n} line${n!==1?'s':''}`, statChars:n=>`${n} char${n!==1?'s':''}`,
    modalTitleInsertImage:"Insert Image", lblImageUrl:"Image URL or file path",
    lblOrPickComputer:"— or pick from your computer —", lblAltText:"Alt Text",
    imgAltPlaceholder:"A descriptive label", lblTitleOptional:"Title (optional tooltip)",
    imgTitlePlaceholder:"Image title", cancelBtn:"Cancel", insertBtn:"Insert",
    pastedImageAlt:"pasted image",
    imagePasted:kb=>`Image added to the markdown (${kb} KB)`,
    imagePasteFailed:"Could not read the image on the clipboard.",
    modalTitleInsertLink:"Insert Link", lblUrl:"URL", lblDisplayText:"Display text",
    linkTextPlaceholder:"Link label", linkTitlePlaceholder:"Hover tooltip",
    modalTitleTableBuilder:"Table Builder", lblRows:"Rows", lblColumns:"Columns",
    noFsApi:"Your browser does not support the File System Access API.\nPlease use Chrome, Edge, or another Chromium-based browser.",
    confirmDiscard:"Discard current content?",
    mammothNotLoaded:"Mammoth.js is not loaded yet. Please check your internet connection and try again.",
    confirmReplace:"Replace current content with imported document?",
    importFailed:msg=>`Failed to import DOCX: ${msg}`,
    scanningFolder:"Scanning folder…", noImagesFound:"No images found.", errorReadingFolder:"Error reading folder.",
    /* ── Workbooks and chapters (see docs/FEATURES.md § E) ── */
    workbooksBtn:"📓 Workbooks", workbooksTip:"Workbooks (Ctrl+2)", workbooksTitle:"Workbooks",
    newWorkbookBtn:"＋ New workbook", syncFolderBtn:"⇩ Sync to folder",
    syncFolderTip:"Take in new workbooks and chapters from the markdown folder and from Google Drive, then write every chapter into the folder",
    saveToWorkbookBtn:"📓 Save to workbook", saveToWorkbookTip:"Save this chapter into a workbook (Ctrl+S)",
    saveAllModifiedBtn:"📚 Save all modified", saveAllModifiedTip:"Save every modified chapter in every workbook (Ctrl+Alt+S)",
    wbEmpty:"No workbooks yet. Click “New workbook” to start one.",
    wbNoChapters:"no chapters yet",
    wbNoOpenTasks:"no chapter has an unchecked box",
    wbLocalOnly:"💾 saved locally (no folder)",
    filterTodoOnTip:"Show only chapters with an unchecked box (“- [ ]”)",
    filterTodoOffTip:"Show all chapters",
    addChapterTip:"New chapter", renameWorkbookTip:"Rename workbook", deleteWorkbookTip:"Delete workbook",
    renameChapterTip:"Rename chapter", exportChapterTip:"Export chapter", deleteChapterTip:"Delete chapter",
    wbRenameHint:"Double-click or F2 to rename",
    moveWorkbookUpTip:"Move workbook up", moveWorkbookDownTip:"Move workbook down",
    moveChapterUpTip:"Move chapter up", moveChapterDownTip:"Move chapter down",
    promptNewWorkbook:"Workbook name:", defaultWorkbookName:"New workbook",
    promptNewChapter:"Chapter title:", defaultChapterName:"New chapter",
    promptRenameWorkbook:"New workbook name:", promptRenameChapter:"New chapter title:",
    confirmDeleteWorkbook:n=>`Delete the workbook “${n}” and every chapter in it?`,
    confirmDeleteChapter:n=>`Delete the chapter “${n}”?`,
    confirmLeaveUnsaved:"The current text isn't saved in any workbook. Discard it?",
    untitledWorkbook:"workbook", untitledChapter:"chapter",
    workbookCreated:n=>`Workbook created: ${n}`,
    chapterOpened:n=>`Chapter open: ${n}`,
    wbEditing:"editing…", wbAutosaved:"autosaved",
    wbSavedTo:p=>`Saved to ${p}`,
    wbSavedLocal:"Chapter saved on this device.",
    wbSynced:n=>`${n} chapter${n===1?'':'s'} written to the folder.`,
    wbAdopted:r=>`Found in the folder: ${r.books} workbook${r.books===1?'':'s'}, ${r.chapters} chapter${r.chapters===1?'':'s'}.`,
    wbNoModified:"No modified chapters.",
    wbSavedAllModified:n=>`${n} modified chapter${n===1?'':'s'} saved.`,
    wbSavedSomeModified:n=>`${n} chapter${n===1?'':'s'} saved; some couldn't be written.`,
    wbStoreFailed:"Couldn't save locally (IndexedDB unavailable).",
    wbRestored:n=>`Resumed: ${n}`,
    wbRecovered:"Recovered: what was on screen was newer than what was stored.",
    wbDraftRestored:"Recovered unsaved text. Ctrl+S to put it in a chapter.",
    looseTip:"This text is in no chapter — it isn't autosaved. Press Ctrl+S.",
    wbRemoved:"Deleted.",
    modalTitleSaveWorkbook:"Save to workbook", lblWorkbook:"Workbook", lblNewWorkbookName:"New workbook name",
    newWorkbookPlaceholder:"Notes", lblChapter:"Chapter", lblChapterTitle:"Chapter title",
    chapterTitlePlaceholder:"Chapter 1", optNewWorkbook:"— new workbook —", optNewChapter:"— new chapter —",
    needWorkbookName:"Give the workbook a name.", needChapterTitle:"Give the chapter a title.",
    saveBtn:"Save", wbPathHint:p=>`File: ${p}`,

    /* ── Google account sync (docs/FEATURES.md § O) ── */
    cloudBtn:"☁ Google account", cloudBtnOn:"☁ Sync now",
    cloudTip:"Keep these chapters on your Google account, so every Chrome signed into it has them",
    cloudTipOn:f=>`Sync with the “${f}” folder in Google Drive (right-click to disconnect)`,
    cloudOff:"☁ this device only",
    cloudReady:"☁ connected, not synced yet",
    cloudAt:h=>`☁ synced at ${h}`,
    cloudOpenTip:f=>`Open the “${f}” folder in Google Drive`,
    cloudStale:"☁ sign-in expired — press again",
    cloudSyncing:"☁ syncing…",
    cloudConnected:f=>`Google account connected. Chapters go to “${f}”.`,
    cloudDone:r=>`Synced: ${r.up} sent, ${r.down} received.`,
    cloudNothing:"Synced — nothing to change.",
    cloudSkipped:"Google Drive not connected — nothing brought from the account.",
    cloudError:m=>`Google Drive: ${m}`,
    cloudNoFile:"Sync can't work when the page is opened straight off disk (file://). Serve it over http(s) — from the site, say — and try again.",
    cloudForgetAsk:"Forget the Google account connection? The chapters stay both here and in Drive.",
    cloudForgot:"Google account disconnected.",

    /* ── First run on a device (docs/FEATURES.md § E) ── */
    welcomeTitle:"Welcome",
    welcomeFolderDesktop:"Choose the folder where the app keeps its files on this device. Workbooks are written into its “markdown” subfolder, and whatever is already there is taken in.",
    welcomeFolderMobile:"This phone's browser can't choose a folder. Pick where saved files go — the share sheet or downloads. The chapters stay in the app either way.",
    welcomeFolderBtn:"📁 Choose folder", welcomeFolderBtnMobile:"📁 Where files go",
    welcomeLaterBtn:"Later",
    welcomeCloudText:"Bring your data from the cloud? Connect your Gmail account: if Google Drive holds workbooks saved from another device, they are brought here.",
    welcomeCloudFolder:f=>`Folder chosen: “${f}”. `,
    welcomeYesBtn:"☁ Yes, connect Google account", welcomeNoBtn:"No, start empty",
    welcomeCloudEmpty:"Google account connected, but Drive holds no chapters yet.",

    /* ── Knowledge graph (docs/FEATURES.md § G) ── */
    wikilinkBtn:"⟦⟧ Note link", wikilinkTip:"Link to a note or a section (Ctrl+Shift+L)",
    graphBtn:"🕸 Graph", graphTip:"Knowledge graph (Ctrl+3)", graphTitle:"Knowledge graph",
    scopeNote:"Note", scopeNoteTip:"Notions inside the open note",
    scopeWorkbook:"Workbook", scopeWorkbookTip:"Chapters of the open workbook",
    scopeVault:"All", scopeVaultTip:"Every chapter of every workbook",
    gvSettingsBtn:"⚙ Settings", gvSettingsTip:"Filters, groups, display, forces",
    gvFitBtn:"⤢ Fit", gvFitTip:"Fit the whole graph in view",
    gvCloseBtn:"✕ Close", gvCloseTip:"Close the graph (Esc)",
    gvZoomInTip:"Zoom in", gvZoomOutTip:"Zoom out",
    gvFilters:"Filters", gvSearchPlaceholder:"Search notes…",
    gvTags:"Tags", gvAttachments:"Attachments", gvExistingOnly:"Existing notes only",
    gvOrphans:"Orphans", gvFocus:"Only what connects to this note", gvDepth:"Depth",
    gvGroups:"Groups", gvGroupsHint:"Colour every node whose name, tag or path contains a word.",
    gvAddGroup:"＋ New group", gvGroupPlaceholder:"search word", gvRemoveGroup:"Remove group",
    gvDisplay:"Display", gvArrows:"Arrows", gvTextFade:"Text fade threshold",
    gvNodeSize:"Node size", gvLinkThickness:"Link thickness",
    gvForces:"Forces", gvCenterForce:"Center force", gvRepelForce:"Repel force",
    gvLinkForce:"Link force", gvLinkDistance:"Link distance", gvResetForces:"↺ Reset forces",
    gvStats:([n,l])=>`${n} node${n===1?'':'s'} · ${l} link${l===1?'':'s'}`,
    gvLinksN:n=>`${n} link${n===1?'':'s'}`,
    gvEmpty:"Nothing to show yet. Write [[Name]] to link one note to another, or give it a #tag.",
    gvEmptySearch:"No node matches that search.",
    gvEmptyWorkbook:"Open a chapter of a workbook to see that workbook's graph.",
    gvAttachmentHint:p=>`Attachment: ${p}`,
    gvLegend_note:"note", gvLegend_active:"current note", gvLegend_heading:"section",
    gvLegend_block:"block", gvLegend_tag:"tag", gvLegend_unresolved:"does not exist",

    /* ── Causality diagram (docs/FEATURES.md § M) ── */
    modeLinks:"🕸 Links", modeLinksTip:"Notes and the links between them",
    modeCause:"⇄ Causality", modeCauseTip:"Key words and what causes what",
    gvLoopsOnly:"Only what is in a loop", gvLoops:"Feedback loops",
    gvCauseHint:"Write a line like “stress -> insomnia -> stress”. -> means “more of”, -| means “less of”, ~> a delayed effect.",
    gvStatsCause:([n,l,c])=>`${n} key word${n===1?'':'s'} · ${l} relation${l===1?'':'s'} · ${c} loop${c===1?'':'s'}`,
    gvEmptyCause:"No causal relations yet. Write a line like “stress -> insomnia -| focus”.",
    gvLoopNone:"No closed loop yet. A loop appears when a chain comes back to where it started.",
    gvLoopR:"reinforcing loop (R)", gvLoopB:"balancing loop (B)",
    gvCauseTip:([a,b,s])=>`${a} ${s} ${b}`,
    gvLegend_keyword:"key word", gvLegend_causePos:"more → more",
    gvLegend_causeNeg:"more → less", gvLegend_loopR:"R loop (amplifies)",
    gvLegend_loopB:"B loop (balances)",
    modalTitleNoteLink:"Link to a note", lblLinkTarget:"Target", lblAliasOptional:"Display text (optional)",
    wikiFilterPlaceholder:"Filter notes, sections and blocks…",
    wikiAliasPlaceholder:"How the link should read",
    wikiThisNote:"this note", wikiLooseFile:"loose file",
    wikiNoCandidates:"Nothing to link to yet.",
    wikiHint:m=>`Inserts: ${m}`,
    wlUnresolvedTip:n=>`“${n}” does not exist yet — click to create it`,
    wlAnchorMissing:a=>`Could not find “${a}” in the note.`,
    wlNoteCreated:n=>`Created the note “${n}”.`,
    confirmCreateNote:n=>`“${n}” does not exist. Create it as a new chapter?`,
    promptPickWorkbook:l=>`Which workbook?\n\n${l}\n\nType the number:`,
    /* ── Photos and films from a folder (docs/FEATURES.md § T) ── */
    mediaBtn:"📸 Photos", mediaTip:"Photos and films from a folder (Ctrl+6)",
    mediaTitle:"Photos and films",
    mbPick:"📂 Choose folder", mbPickTip:"Choose a folder and read everything under it, subfolders included",
    mbCsvBtn:"⇩ CSV", mbCsvTip:"Save what is on screen as a CSV file",
    mbFormatLabel:"Write as", mbKindLabel:"Show",
    mbSearchPlaceholder:"Any part of the name or the folder…",
    mbFmtList:"List", mbFmtTimeline:"Timeline", mbFmtTable:"Table",
    mbKindAll:"Everything", mbKindImg:"Photos only", mbKindVid:"Films only",
    mbOptName:"Name from the file name", mbOptGeo:"Place (^@) from GPS",
    mbOptLink:"Link the file", mbOptDay:"A heading per day",
    mbOptMeta:"Only what the metadata says",
    mbColFile:"File", mbColWhen:"When", mbColSrc:"Date from",
    mbColWhere:"Where", mbColName:"Name",
    mbSrc_meta:"metadata", mbSrc_name:"file name", mbSrc_file:"file date",
    mbNoDate:"no date", mbNoGeo:"no GPS",
    mbNoFolder:"Choose a folder — every photo and film under it, subfolders included, lands here.",
    mbNoMatch:"No file gets past the filters above.",
    mbCount:a => a[0] + " of " + a[1],
    mbBreak:a => a[0] + " dated by metadata · " + a[1] + " with GPS",
    mbScanning:a => "Reading… " + a[0] + "/" + a[1],
    mbNothing:"Nothing is ticked to write.",
    mbInserted:n => n + (n === 1 ? " line written into the chapter" : " lines written into the chapter"),
    mbInsertBtn:"↩ Insert into editor", mbInsertTip:"Write the ticked rows into the chapter",
    /* ── Garden toolbox (docs/FEATURES.md § N) ── */
    gardenBtn:"🌱 Garden", gardenTip:"Garden toolbox (Ctrl+5)", gardenTitle:"Garden toolbox",
    gdTabAct:"🌾 Activities", gdTabActTip:"Everything done, with its duration and its water",
    gdTabHarvest:"🧺 Harvest", gdTabHarvestTip:"What was picked, by plant and by plot",
    gdTabMow:"🌿 Mowing", gdTabMowTip:"How many times, and how many rounds, each plot was mown",
    gdScopeGarden:"Garden", gdScopeGardenTip:"Every workbook whose name says garden",
    gdFrom:"From", gdTo:"Up to",
    gdPlaceLabel:"Place", gdPlantLabel:"Plant", gdCatLabel:"Activity",
    gdGroupLabel:"Group by", gdSearchLabel:"Contains",
    gdSearchPlaceholder:"Any word on the line…",
    gdAllPlaces:"Every place", gdAllPlants:"Every plant", gdAllCats:"Every activity",
    gdGroup_none:"No grouping", gdGroup_day:"Day", gdGroup_month:"Month",
    gdGroup_place:"Place", gdGroup_plant:"Plant", gdGroup_cat:"Activity",
    gdCat_harvest:"Harvest", gdCat_mow:"Mowing", gdCat_water:"Watering", gdCat_sow:"Sowing",
    gdCat_care:"Upkeep", gdCat_build:"Building", gdCat_other:"Other",
    gdColDate:"Date", gdColCat:"Activity", gdColPlace:"Place", gdColInterval:"Interval",
    gdColDuration:"Duration", gdColWater:"Water", gdColDetail:"The line as written",
    gdColPlant:"Plant", gdColQty:"Quantity", gdColRounds:"Rounds",
    gdColGroup:"Group", gdColCount:"Records", gdColSessions:"Times",
    gdPieces:"pcs",
    gdFootAct:a=>`${a.n} ${a.n===1?"activity":"activities"} · ${a.dur} · ${a.litres} of water`,
    gdFootHarvest:a=>`${a.n} ${a.n===1?"pick":"picks"} · ${a.qty}`,
    gdFootMow:a=>`${a.n} ${a.n===1?"session":"sessions"} · ${a.rounds} rounds`,
    gdUpTo:d=>`up to ${d}`, gdAllTime:"everything written",
    gdEmpty:"Nothing here. Write a day as “@dd.mm.yyyy”, then lines like “udat rand 5 in sm 06:02 - 06:30, 250 l apa” or “cules din s1: 340 g vinete”.",
    gdReset:"↺ Reset", gdResetTip:"Back to everything, up to today",
    gdCsvBtn:"⇩ CSV", gdCsvTip:"Save what is on screen as a CSV file",
    gdCloseBtn:"✕ Close", gdCloseTip:"Close the garden toolbox (Esc)",
    findBtn:"🔍 Find", findTip:"Search and filter (Ctrl+4)",
    findTitle:"Search & filter", closeFindTip:"Close (Ctrl+4)",
    findPlaceholder:"Search the text…", findClearTip:"Clear the search",
    findScopeChapter:"Chapter", findScopeChapterTip:"Only the chapter open in the editor",
    findScopeWorkbook:"Workbook", findScopeWorkbookTip:"Every chapter of this workbook",
    findScopeAll:"All", findScopeAllTip:"Every chapter of every workbook",
    findCaseTip:"Match case", findWordTip:"Whole words only",
    findRegexTip:"Regular expression", findFoldTip:"Ignore diacritics (a finds ă, â)",
    findCtxTip:"More context around each match",
    findCollapseAllTip:"Collapse all results", findExpandAllTip:"Expand all results",
    findCollapseNoteTip:"Collapse this chapter", findExpandNoteTip:"Expand this chapter",
    findKindsLabel:"Only", findTagsLabel:"Tags",
    findKind_heading:"headings", findKind_text:"text", findKind_list:"lists",
    findKind_code:"code", findKind_quote:"quotes", findKind_table:"tables",
    findIdle:"Type to search, or pick a tag.",
    findNothing:"Nothing found.",
    findBadRegex:"That regular expression is not valid.",
    findLooseHint:"The open document is not in a workbook — searching it alone.",
    findEmptyScope:"There are no chapters to search.",
    findLineNo:n=>`line ${n}`,
    findOpenNoteTip:"Open this chapter",
    findFoot:o=>`${o.m} match${o.m!==1?'es':''} in ${o.n} chapter${o.n!==1?'s':''}`,
    findFootNotes:o=>`${o.n} chapter${o.n!==1?'s':''}`,

    /* Quick idea capture (Ctrl+Alt+I) — docs/FEATURES.md § J */
    ideaBtn:"💡 Idea", ideaTip:"Capture an idea straight into its chapter (Ctrl+Alt+I)",
    calSyncBtn:"📅 Push dates", calSyncTip:"Send every \u201C@date\u201D in every workbook to the calendar (Ctrl+Alt+D)",
    kanbanBtn:"▦ Kanban", kanbanTip:"Open the task board for this chapter",
    ganttBtn:"▤ Gantt", ganttTip:"Show this chapter's tasks as a Gantt chart",
    ganttTitle:"Chapter Gantt chart", ganttHelp:"Put #1 on a prerequisite task and $1 on each task that depends on it. Dates: start@2026-09-24 and end@2026-09-30.",
    ganttTasks:"Tasks", ganttEmpty:"No tasks in this chapter. Add a “- [ ]” line.", ganttNoDate:"undated · shown today", ganttStart:"Start", ganttEnd:"End", ganttDepends:"Depends on", ganttMissing:n=>`No task #${n} exists in this chapter.`, ganttDuplicate:n=>`Marker #${n} is on multiple tasks.`,
    calSynced:([n, gone]) => (n === 1 ? "1 date sent to the calendar" : n + " dates sent to the calendar") +
                             (gone ? ", " + gone + " removed" : "") + ".",
    calNoDates:"No \u201C@date\u201D found. Write one like @2026-09-03 14:00-15:30.",
    calOpen:"Open",
    mapBtn:"\uD83D\uDDFA Map", mapTip:"Show this chapter's \u201C^@\u201D places on the map (Ctrl+Alt+M)",
    mapNone:"No \u201C^@\u201D place in this chapter. Write one like ^@Pele\u0219 Castle.",
    modalTitleIdea:"Quick idea", lblIdea:"Idea",
    ideaPlaceholder:"Editor: - [ ] write code to …",
    ideaSaveBtn:"Send idea", ideaSaveTip:"File this idea (Ctrl+Enter)",
    ideaHintIdle:"Start with the chapter name followed by \":\". Without one, the idea goes to Idei.",
    ideaHintTo:o=>`Goes to ${o.book} / ${o.chapter}`,
    ideaHintNew:o=>`Will create ${o.book} / ${o.chapter}`,
    ideaHintFallback:o=>`No chapter called \u201c${o.name}\u201d \u2014 the idea goes to ${o.book} / ${o.chapter}`,
    ideaEmpty:"Write the idea first.",
    ideaSaved:o=>`Idea filed in ${o.book} / ${o.chapter}`,
    ideaSavedTo:o=>`Idea filed in ${o.book} / ${o.chapter} → ${o.path}`,
    ideaFailed:"Could not save the idea.",

    /* Help modal */
    helpBtn:"Help", helpTip:"Help", modalTitleHelp:"Help — Markdown editor", closeBtn:"Close",
    helpBody:`
      <h3>What this page does</h3>
      <p>The Markdown editor keeps notes in <b>workbooks</b> holding <b>chapters</b> — one chapter is one .md file. You write on the left, the preview renders on the right.</p>
      <h3>The folder on your device, and syncing with the cloud</h3>
      <p>The single most important part of this page: where your files actually live, and how they stay the same across every device.</p>
      <ul>
        <li>The <b>📁</b> button in the top bar (or "📁 Set folder…" in the Workbooks panel) picks the folder on disk where workbooks are written — a real folder on a computer; on a phone, files go through the system's share sheet instead, since no mobile browser offers a folder picker. Without a folder set, what you write stays only in this browser (localStorage) and is lost if the browser's data is cleared.</li>
        <li><b>☁ Google account</b>, in the top bar, connects your Google account and syncs chapters with Google Drive — one file per chapter, in its own folder in Drive. Click once to connect, click again anytime to sync, right-click to disconnect. Only works with the page open over HTTP(S), not opened directly as a local file.</li>
        <li><b>⇩ Sync to folder</b>, beside "☁ Google account", is the single most important button on the page: it reads the folder on disk for workbooks or chapters added there by hand (a new folder becomes a workbook, a new .md file becomes a chapter), pulls in whatever is new from Google Drive, then writes every chapter back into the folder. This is how workbooks written on one device reach another.</li>
        <li>The first time the page runs on a new device, a window asks for the folder first, then asks whether to bring your data from the cloud — answer "Yes" to pull in everything written on another device.</li>
      </ul>
      <h3>Workbooks and chapters</h3>
      <ul>
        <li>The "Workbooks" panel (<kbd>Ctrl+2</kbd>) shows every workbook and its chapters; double-click or <kbd>F2</kbd> on a name renames it in place.</li>
        <li>Drag a chapter to reorder it within a workbook or move it to another workbook. On a touch screen, press and hold the chapter, then drag it.</li>
        <li>What you type autosaves as you go; "Save to workbook" (<kbd>Ctrl+S</kbd>) also writes it to disk, if you've picked a folder with the 📁 button up top.</li>
        <li>"📚 Save all modified" (<kbd>Ctrl+Alt+S</kbd>) writes every modified chapter across every workbook at once — a dot next to a name shows what hasn't hit disk yet.</li>
        <li>"⇩ Sync to folder", beside "☁ Google account" in the top bar, takes in new workbooks and chapters from the markdown folder and from Google Drive, then writes every chapter back to that folder. On the first run on a new device, the app asks for the folder first, then whether to bring your data from the cloud.</li>
        <li>"☁ Google account" connects and syncs chapters with Google Drive; click again to sync, or right-click to disconnect. Open this page over HTTP(S), not directly as <code>file://</code>, to use it.</li>
        <li>A workbook named with "TODO" gets a ☑ button that shows only chapters with an open task; the toolbar's "▣ Tasks only" does the same across every workbook regardless of its name, and shows only the unchecked "- [ ]" lines of the open chapter — not finished tasks, not the rest of the text.</li>
      </ul>
      <h3>Formatting</h3>
      <p>The toolbar has bold, italic, headings, lists, a todo list, code, a table, an image, a link, font size, text color and highlight. Select text and apply size, color and highlight in any combination. Pasting a picture (<kbd>Ctrl+V</kbd>) drops it straight into the text as an embedded image.</p>
      <h3>[[Wikilinks]] and #tags</h3>
      <ul>
        <li>Type <code>[[</code> for note suggestions (↑↓ to move, Enter/Tab to insert, Esc to dismiss), or use the ⟦⟧ Note link button / <kbd>Ctrl+Shift+L</kbd>.</li>
        <li><code>[[Note]]</code> opens a chapter; <code>[[Note#Section]]</code> jumps to a heading; <code>[[Note#^anchor]]</code> jumps to one block; <code>[[#Section]]</code> links inside the current note.</li>
        <li><code>![[image.png]]</code> embeds a picture; <code>![[Note]]</code> becomes a card that opens the note.</li>
        <li><code>#tag</code> marks a word as a tag.</li>
        <li>A link to a note that doesn't exist yet is still a link — following it creates the chapter.</li>
      </ul>
      <h3>The knowledge graph</h3>
      <p>The "Graph" button or <kbd>Ctrl+3</kbd> shows notes as connected nodes — look at just the open note, the whole workbook, or everything you've written. The panel on the left has Filters, Groups, Display and Forces.</p>
      <h3>Causality diagram</h3>
      <ul>
        <li>Inside the graph, the "⇄ Causality" switch draws key words and what causes what, instead of notes and links.</li>
        <li>Write the relation on a line of its own: <code>stress -&gt; insomnia -&gt; stress</code>. <code>-&gt;</code> means "more of this, more of that", <code>-|</code> means "more of this, less of that", and <code>~&gt;</code> / <code>~|</code> mark an effect that arrives later.</li>
        <li>A chain that closes on itself is a loop: <b>R</b> if it amplifies itself (a vicious or virtuous circle), <b>B</b> if it balances itself. Loops are listed in the panel — rest on one to light it up on the canvas, click to pin it.</li>
        <li>A key word may also be written as <code>[[Note]]</code> or <code>#tag</code> — the diagram takes the word, the preview keeps the link.</li>
      </ul>
      <h3>The garden toolbox</h3>
      <p>The 🌱 button or <kbd>Ctrl+5</kbd> reads the garden workbook and pulls three tables out of it. Write the day as <code>@22.07.2026</code> and below it what you did, in your own words:</p>
      <ul>
        <li><b>Activities</b> — a line with an interval becomes an activity with a duration: <code>udat rand 5 in sm 06:02 - 06:30, 250 l apa</code> → Watering, Solar mare, 28 m, 250 l. Litres only count where the line says they are water, so "am rămas cu 60 l" (what was left) stays out of the total.</li>
        <li><b>Harvest</b> — <code>cules din s1: 340 g vinete, 800 g ardei</code> gives one row per plant, in grams. The other order works too (<code>zucchini 450 g</code>), and so does no colon (<code>cules din sm 5,3 kg rosii</code>).</li>
        <li><b>Mowing</b> — <code>cosit 4 ture … din gg</code> or <code>cosit 4 gn</code> counts both the times and the rounds, per plot.</li>
      </ul>
      <p>Plot codes (<code>sm</code>, <code>s1</code>, <code>s2</code>, <code>gg</code>, <code>gp</code>, <code>gn</code>, "solar mare"…) and plant names are matched with their synonyms; anything not on the list is kept exactly as written. Filter by date, place, plant or activity, group by day / month / place / plant, and the total at the bottom follows the filter — "Up to" starts at today, so it is the running total so far. ⇩ CSV saves exactly what is on screen, and clicking a row takes you to that line in the text.</p>
      <h3>Photos and films from a folder</h3>
      <p>The 📸 button or <kbd>Ctrl+6</kbd> opens a folder — subfolders and all — and reads out of every photo and every film what the camera wrote into the file: <b>when</b> it was taken and <b>where</b>. The "Date from" column says which source answered: <b>metadata</b> (EXIF in a photo, the <code>moov</code> boxes in a film), <b>file name</b> (a date in the name, when the metadata has none) or <b>file date</b> (what the disk says — the last resort).</p>
      <ul>
        <li><b>Name from the file name</b> — the rule is "whatever is not a date and not a clock": <code>2024-07-12 Ana la mare.jpg</code> leaves "Ana la mare", <code>IMG_20240712_153000.jpg</code> leaves nothing, and <code>Casa 12.png</code> keeps its 12.</li>
        <li><b>Place (^@) from GPS</b> — the coordinates become a <code>^@44.4268, 26.1025</code> marker, so they go straight onto the <b>map</b> (🗺).</li>
        <li>It writes as a <b>list</b> (a line with an <code>@date</code>, the name and the file), as a <b>timeline</b> (<code>#date - !what</code>) or as a <b>table</b>. The tick on each row decides what gets written; ⇩ CSV saves everything on screen.</li>
      </ul>
      <h3>Search and filter</h3>
      <p>🔍 Find, <kbd>Ctrl+4</kbd> or <kbd>Ctrl+Shift+F</kbd> opens search: chapter / workbook / everything, with Aa (match case), ⌈ab⌉ (whole words), .* (regular expression) and ăâ (ignore diacritics, on by default) toggles, plus filters by line kind and by tag.</p>
      <p>The toolbar filters can narrow the workbooks and preview to one assignee or tasks with the selected importance. "▣ Tasks only" keeps just unchecked task lines.</p>
      <h3>Quick idea capture</h3>
      <p>The 💡 button or <kbd>Ctrl+Alt+I</kbd> opens one box: write "Chapter name: idea" and the text lands there — or, with no name, in the "Idei" workbook, under today's chapter. <kbd>Ctrl+Enter</kbd> files it, <kbd>Esc</kbd> closes the box.</p>
      <h3>Importance markers</h3>
      <p><code>!nice</code> 🌱, <code>!important</code> ⭐, <code>!vital</code> 🔥 — from the toolbar select or <kbd>Ctrl+Alt+1/2/3</kbd> (<kbd>Ctrl+Alt+0</kbd> clears). Clicking a pill searches for everything else carrying the same marker.</p>
      <h3>Task status</h3>
      <p>A task can be to do (<code>- [ ]</code>), in work (<code>- [ ] ~inwork</code>), on hold (<code>- [ ] ~onhold</code>), blocked (<code>- [ ] ~blocked</code>), or done (<code>- [x]</code>). Pick a status in the toolbar for the task at the caret or the selected tasks. The preview checkbox marks a task done or returns it to to do.</p>
      <p>The ▦ Kanban button opens the current chapter as a task board. Select one chapter, one workbook, or every workbook, then search, filter, and move tasks between states. Write <code>start@2026-09-24</code> or <code>end@2026-09-30</code> in a task to show its start or due date.</p>
      <p>The ▤ Gantt button draws the current chapter's tasks across days, including unsaved edits. Put <code>#1</code> on a task and <code>$1</code> on tasks that depend on it; arrows show the dependencies. <code>start@</code> and <code>end@</code> set the date range; an undated task appears on today's date. Click a task title to jump to its line in the editor.</p>
      <h3>Assignee marker</h3>
      <p><code>&gt;&gt;Name</code> can appear anywhere in the text, including outside a task, to mark a responsible person. The leading <code>Name&gt;&gt; text</code> form also works.</p>
      <h3>The @date marker</h3>
      <p><code>@2026-09-03</code>, <code>@2026-09-03 14:00</code>, <code>@2026-09-03 14:00-15:30</code>, or a day range with <code>..</code> — written anywhere in the text. 📅 "Push dates" or <kbd>Ctrl+Alt+D</kbd> sends every marker to the Calendar page.</p>
      <h3>The ^@ place marker</h3>
      <p><code>^@Peleș Castle</code>, <code>^@12 Lipscani Street, Bucharest</code> or <code>^@44.4268, 26.1025</code> — a name, an address or coordinates, written to the end of the line. What follows a <code>|</code> is a note, and a <code>#tag</code> ends the address and stays the line's.</p>
      <p>The 🗺 Map button is there only while the open chapter holds a <code>^@</code>; it (or <kbd>Ctrl+Alt+M</kbd>) takes the places to the Map page, laid out in layers by the heading above each one.</p>
      <h3>Timeline</h3>
      <ul>
        <li>A line written <code>#1969 - !First man on the Moon</code> is one entry: <code>#</code> opens the date, <code>!</code> opens what happened, and the <code>-</code> between them ties the two together.</li>
        <li>Lines written one under the other are a single timeline — an SVG drawing with a dot per entry, placed where its date falls between the first and the last, and the list under it, numbered the same.</li>
        <li>The date can be a year, a month or a day: <code>#1969</code>, <code>#2026-09</code>, <code>#2026-09-21</code>, <code>#21.09.2026</code>.</li>
        <li>After the <code>!</code> write text, a picture — <code>![moon](moon.png)</code> — or a link — <code>![Apollo 11](https://nasa.gov)</code>. The same shape; where it points says which it is.</li>
        <li>The ⏳ Timeline toolbar button writes three lines to write over.</li>
      </ul>
      <h3>Undo / redo</h3>
      <p><kbd>Ctrl+Z</kbd> undoes, <kbd>Ctrl+Shift+Z</kbd> or <kbd>Ctrl+Y</kbd> redoes — the editor's own history, separate from the browser's, which keeps up with every toolbar action too.</p>
      <h3>Import / export</h3>
      <p>"Import DOCX" brings in a Word file as markdown; "Export HTML" writes a self-contained page, with a copy button on its code blocks. "🌐 Open HTML" opens a previously exported HTML page in a new tab.</p>
      <h3>Voice dictation</h3>
      <p>The 🎙 icon in the toolbar transcribes speech straight at the caret, using the settings saved on the "Caiet vocal" page.</p>
      <h3>Shortcuts</h3>
      <p>
        <kbd>Ctrl+S</kbd> save to workbook · <kbd>Ctrl+Shift+S</kbd> export file · <kbd>Ctrl+Alt+S</kbd> save all modified ·
        <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> / <kbd>Ctrl+Y</kbd> undo/redo ·
        <kbd>Ctrl+B</kbd> bold · <kbd>Ctrl+I</kbd> italic · <kbd>Ctrl+K</kbd> link · <kbd>Ctrl+Shift+K</kbd> code block ·
        <kbd>Ctrl+Shift+1..6</kbd> headings H1-H6 ·
        <kbd>Ctrl+Enter</kbd> / <kbd>Ctrl+Shift+Enter</kbd> blank line after/before · <kbd>Alt+↑/↓</kbd> move line ·
        <kbd>Ctrl+L</kbd> select the line (press again for the paragraph) ·
        <kbd>Ctrl+1</kbd> navigation · <kbd>Ctrl+2</kbd> workbooks · <kbd>Ctrl+4</kbd> / <kbd>Ctrl+Shift+F</kbd> search · <kbd>Ctrl+3</kbd> graph · <kbd>Ctrl+5</kbd> garden · <kbd>Ctrl+6</kbd> photos ·
        <kbd>Ctrl+Shift+L</kbd> [[note]] link ·
        <kbd>Ctrl+Alt+I</kbd> quick idea · <kbd>Ctrl+Alt+D</kbd> push dates to calendar · <kbd>Ctrl+Alt+M</kbd> map ·
        <kbd>Ctrl+Alt+1/2/3</kbd> importance (<kbd>Ctrl+Alt+0</kbd> clears) ·
        <kbd>F2</kbd> renames the selected workbook/chapter · <kbd>Esc</kbd> closes whatever's open.
      </p>
    `
  }
};
let UI = "ro";
function t(k,a){ const v = I18N[UI][k]; return typeof v === "function" ? v(a) : v; }
const LANG_KEY = "scula:ui-lang";
const store = (function(){
  const hasWS = typeof window.storage === "object" && window.storage && typeof window.storage.get === "function";
  let ls = null;
  if(!hasWS){
    try{ localStorage.setItem("__md","1"); localStorage.removeItem("__md"); ls = localStorage; }
    catch(e){ ls = null; }
  }
  const mem = {};
  return {
    async get(k){
      if(hasWS){ try{ const r = await window.storage.get(k); return r ? r.value : null; }catch(e){ return null; } }
      if(ls){ try{ return ls.getItem(k); }catch(e){ return null; } }
      return mem[k] || null;
    },
    async set(k,v){
      if(hasWS){ try{ await window.storage.set(k,v); return; }catch(e){} }
      if(ls){ try{ ls.setItem(k,v); return; }catch(e){} }
      mem[k] = v;
    }
  };
})();
const UI_ATTRS = ["placeholder", "title", "aria-label", "value", "alt"];
function applyUILang(){
  document.documentElement.lang = UI;
  document.querySelectorAll("[data-i]").forEach(el => { el.textContent = t(el.getAttribute("data-i")); });
  UI_ATTRS.forEach(attr => {
    const d = "data-i-" + attr.replace("aria-label", "aria");
    document.querySelectorAll("[" + d + "]").forEach(el => el.setAttribute(attr, t(el.getAttribute(d))));
  });
  const navBtn = document.getElementById("navLangBtn");
  if(navBtn) navBtn.textContent = UI === "ro" ? "EN" : "RO";
  try{ localStorage.setItem(LANG_KEY, UI); }catch(e){}
  if(typeof updateStatus === "function") updateStatus();
  // The workbook tree is generated, not markup, so data-i can't reach it.
  // wbBooted is a `var` on purpose: this runs before the rest of the script.
  if(typeof renderWorkbooks === "function" && wbBooted) renderWorkbooks();
  // Same for the graph's legend, groups and counts, while it is open.
  if(typeof gvRepaintLang === "function" && gvLangReady) gvRepaintLang();
  // And for the search panel's generated chips, results and counts.
  if(typeof fdRepaintLang === "function" && fdReady) fdRepaintLang();
  // And for the garden toolbox, whose whole table is generated.
  if(typeof gdRepaintLang === "function" && gdReady) gdRepaintLang();
  // And for the photo table, whose every column and cell is generated.
  if(typeof mbRepaintLang === "function" && mbReady) mbRepaintLang();
  // And for the "@date" pills, whose label is a formatted date, not a key.
  if(typeof calRepaintLang === "function") calRepaintLang();
  // The Drive-sync button's label depends on the connection, not on a
  // data-i key, so it repaints itself — docs/FEATURES.md § O.
  if(typeof paintCloud === "function") paintCloud();
}
window.addEventListener("scula-ui-lang", e => { UI = e.detail; applyUILang(); store.set(LANG_KEY, UI); if (document.getElementById('help-modal').classList.contains('open')) paintHelp(); });
(async function initUILang(){
  let saved = null;
  try{ saved = await store.get(LANG_KEY); }catch(e){}
  UI = saved === "en" || saved === "ro" ? saved : "ro";
  applyUILang();
})();
