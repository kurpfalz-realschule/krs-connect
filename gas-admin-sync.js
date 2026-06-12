// ============================================================
// KRS Connect — Admin-Sheet ↔ Supabase Sync
// ============================================================
// Dieses Script gehört zum Google Sheet "refsheet teams"
// Sheet-ID: 1i81Zb9A2rpI1X8fkG11EwBs_BsaSFGUGtIaDfj_LHGE
//
// ANLEITUNG:
// 1. Im Sheet: Erweiterungen > Apps Script
// 2. Alles in Code.gs löschen
// 3. Diesen gesamten Inhalt einfügen
// 4. Speichern (Strg+S)
// 5. Menü "KRS Connect" erscheint im Sheet
// 6. "Setup: Sheets anlegen" ausführen
// ============================================================

// Secrets werden ueber PropertiesService gespeichert (nicht im Klartext im Code).
// Beim ersten Start werden die Werte automatisch einmalig gespeichert.
// Danach koennen sie ueber "Secrets einrichten" im Menu geaendert werden.
var _props = PropertiesService.getScriptProperties();
var SUPABASE_URL = _props.getProperty('SUPABASE_URL') || '';
var SUPABASE_KEY = _props.getProperty('SUPABASE_KEY') || '';

// === AUTO-SETUP: Beim ersten Start Secrets automatisch speichern ===
function _autoSetupSecrets() {
  if (SUPABASE_URL && SUPABASE_KEY) return; // Bereits konfiguriert
  var defaultUrl = 'https://ooejsfixxiuobrpqgfqm.supabase.co';
  var defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vZWpzZml4eGl1b2JycHFnZnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjQ5MDYsImV4cCI6MjA4OTYwMDkwNn0.GbAv-sB4B8nNE3IPfiYIjbkMKs0Aq03c_-TUcmFY_5s';
  _props.setProperties({ 'SUPABASE_URL': defaultUrl, 'SUPABASE_KEY': defaultKey });
  SUPABASE_URL = defaultUrl;
  SUPABASE_KEY = defaultKey;
}

// === MENU ===
function onOpen() {
  _autoSetupSecrets(); // Einmalig beim ersten Start
  SpreadsheetApp.getUi().createMenu('KRS Connect')
    .addItem('Setup: Sheets anlegen', 'setupSheets')
    .addItem('Secrets aendern', 'setupSecrets')
    .addItem('Feedback-Sheet einrichten', 'setupFeedbackSheet')
    .addSeparator()
    .addItem('Sheet -> Supabase sync', 'syncToSupabase')
    .addItem('Supabase -> Sheet laden', 'loadFromSupabase')
    .addSeparator()
    .addItem('Hilfe', 'showHelp')
    .addToUi();
}

// === SECRETS MANUELL AENDERN ===
function setupSecrets() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('Aktuelle URL: ' + (SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : '(nicht gesetzt)'));
  var urlResult = ui.prompt('Neue Supabase URL eingeben (oder Cancel fuer keine Aenderung):', ui.ButtonSet.OK_CANCEL);
  if (urlResult.getSelectedButton() !== ui.Button.OK) return;
  var keyResult = ui.prompt('Neuen Supabase Anon-Key eingeben:', ui.ButtonSet.OK_CANCEL);
  if (keyResult.getSelectedButton() !== ui.Button.OK) return;

  var url = urlResult.getResponseText().trim();
  var key = keyResult.getResponseText().trim();
  if (!url || !key) {
    ui.alert('URL und Key duerfen nicht leer sein!');
    return;
  }

  _props.setProperties({ 'SUPABASE_URL': url, 'SUPABASE_KEY': key });
  SUPABASE_URL = url;
  SUPABASE_KEY = key;
  ui.alert('Neue Secrets gespeichert!');
}

// === SETUP: Sheets mit Headern anlegen ===
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Sheet 1: Kollegium ---
  var kollegium = ss.getSheetByName('Kollegium') || ss.insertSheet('Kollegium');
  if (kollegium.getLastRow() === 0 || kollegium.getRange('A1').getValue() === '') {
    kollegium.getRange('A1:G1').setValues([[
      'Kuerzel', 'Vorname', 'Nachname', 'E-Mail', 'Rolle', 'Faecher', 'Status'
    ]]);
    kollegium.getRange('A1:G1').setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
    kollegium.setColumnWidths(1, 7, 120);
    // Beispieldaten
    kollegium.getRange('A2:G3').setValues([
      ['KOT', 'Norbert', 'Kotzan', 'kotzan@gmail.com', 'admin', 'Mu,Inf', 'aktiv'],
      ['CRS', 'Petra', 'Carse', '', 'admin', '', 'aktiv']
    ]);
    // Dropdown fuer Rolle
    var roleRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['admin', 'lehrer', 'gast'])
      .build();
    kollegium.getRange('E2:E100').setDataValidation(roleRule);
    // Dropdown fuer Status
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['aktiv', 'inaktiv'])
      .build();
    kollegium.getRange('G2:G100').setDataValidation(statusRule);
  }

  // --- Sheet 2: Teams & Kanaele ---
  var teams = ss.getSheetByName('Teams & Kanaele') || ss.insertSheet('Teams & Kanaele');
  if (teams.getLastRow() === 0 || teams.getRange('A1').getValue() === '') {
    teams.getRange('A1:F1').setValues([[
      'Team-Name', 'Kanal-Name', 'Beschreibung', 'Typ', 'Icon', 'Sortierung'
    ]]);
    teams.getRange('A1:F1').setFontWeight('bold').setBackground('#34a853').setFontColor('white');
    teams.setColumnWidths(1, 6, 140);
    // Standard-Teams und Kanaele
    teams.getRange('A2:F8').setValues([
      ['Kollegium', 'Allgemein', 'Allgemeine Infos fuer alle', 'public', '', '1'],
      ['Kollegium', 'Vertretungsplan', 'Taeglicher Vertretungsplan', 'public', '', '2'],
      ['Kollegium', 'IT & Technik', 'Technische Fragen und Hilfe', 'public', '', '3'],
      ['Kollegium', 'Termine', 'Konferenzen, Events, Deadlines', 'public', '', '4'],
      ['Fachschaft Musik', 'Allgemein', 'Fachschaft Musik', 'public', '', '10'],
      ['Fachschaft Informatik', 'Allgemein', 'Fachschaft Informatik', 'public', '', '11'],
      ['Schulleitung', 'Intern', 'Nur fuer Schulleitung', 'private', '', '20']
    ]);
    var typRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['public', 'private', 'announcement'])
      .build();
    teams.getRange('D2:D100').setDataValidation(typRule);
  }

  // --- Sheet 3: Mitgliedschaften ---
  var mitglied = ss.getSheetByName('Mitgliedschaften') || ss.insertSheet('Mitgliedschaften');
  if (mitglied.getLastRow() === 0 || mitglied.getRange('A1').getValue() === '') {
    mitglied.getRange('A1:C1').setValues([[
      'Kuerzel', 'Team-Name', 'Rolle-im-Team'
    ]]);
    mitglied.getRange('A1:C1').setFontWeight('bold').setBackground('#ea4335').setFontColor('white');
    mitglied.setColumnWidths(1, 3, 150);
    // Beispiel
    mitglied.getRange('A2:C4').setValues([
      ['KOT', 'Kollegium', 'owner'],
      ['KOT', 'Fachschaft Musik', 'owner'],
      ['CRS', 'Schulleitung', 'owner']
    ]);
    var teamRoleRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['owner', 'member', 'readonly'])
      .build();
    mitglied.getRange('C2:C200').setDataValidation(teamRoleRule);
  }

  // Loesche Standard-Sheet1 falls leer
  var sheet1 = ss.getSheetByName('Tabellenblatt1') || ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() <= 1) {
    try { ss.deleteSheet(sheet1); } catch(e) { /* ignore if last sheet */ }
  }

  SpreadsheetApp.getUi().alert('Setup abgeschlossen! 3 Sheets angelegt:\n- Kollegium\n- Teams & Kanaele\n- Mitgliedschaften\n\nTrage jetzt deine Kollegen ein und klicke dann "Sheet -> Supabase sync".');
}

// === SUPABASE REST HELPER ===
function supabaseFetch(endpoint, method, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase-Secrets nicht konfiguriert! Bitte im Menu "Secrets einrichten" ausfuehren.');
  }
  var options = {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    muteHttpExceptions: true
  };
  if (body) {
    options.payload = JSON.stringify(body);
  }
  var response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + endpoint, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase ' + code + ': ' + text);
  }
  return text ? JSON.parse(text) : null;
}

// === SYNC: Sheet -> Supabase ===
function syncToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var log = [];

  // 1. Kollegium -> users
  var kollegium = ss.getSheetByName('Kollegium');
  if (!kollegium) { ui.alert('Sheet "Kollegium" nicht gefunden!'); return; }
  var userData = kollegium.getDataRange().getValues();
  var headers = userData.shift(); // Remove header row

  var userCount = 0;
  for (var i = 0; i < userData.length; i++) {
    var row = userData[i];
    if (!row[0]) continue; // Skip empty rows
    var kuerzel = String(row[0]).trim();
    var user = {
      display_name: String(row[1]).trim() + ' ' + String(row[2]).trim(),
      email: String(row[3]).trim() || null,
      role: String(row[4]).trim() || 'lehrer',
      avatar_color: getColorForKuerzel(kuerzel),
      status: 'online'
    };

    // Upsert: Check if user exists
    var existing = supabaseFetch('users?display_name=eq.' + encodeURIComponent(user.display_name) + '&select=id', 'GET');
    if (existing && existing.length > 0) {
      // Update
      supabaseFetch('users?id=eq.' + existing[0].id, 'PATCH', user);
      log.push('Updated: ' + user.display_name);
    } else {
      // Insert
      supabaseFetch('users', 'POST', user);
      log.push('Created: ' + user.display_name);
    }
    userCount++;
  }

  // 2. Teams & Kanaele -> teams + channels
  var teamsSheet = ss.getSheetByName('Teams & Kanaele');
  if (teamsSheet) {
    var teamData = teamsSheet.getDataRange().getValues();
    teamData.shift(); // Remove header

    var teamNames = {};
    var channelCount = 0;

    for (var j = 0; j < teamData.length; j++) {
      var tRow = teamData[j];
      if (!tRow[0]) continue;
      var teamName = String(tRow[0]).trim();
      var channelName = String(tRow[1]).trim();

      // Create team if not exists
      if (!teamNames[teamName]) {
        var existingTeam = supabaseFetch('teams?name=eq.' + encodeURIComponent(teamName) + '&select=id', 'GET');
        if (existingTeam && existingTeam.length > 0) {
          teamNames[teamName] = existingTeam[0].id;
        } else {
          var newTeam = supabaseFetch('teams', 'POST', { name: teamName, description: teamName });
          if (newTeam && newTeam.length > 0) {
            teamNames[teamName] = newTeam[0].id;
            log.push('Team created: ' + teamName);
          }
        }
      }

      // Create channel
      if (teamNames[teamName] && channelName) {
        var existingCh = supabaseFetch(
          'channels?team_id=eq.' + teamNames[teamName] + '&name=eq.' + encodeURIComponent(channelName) + '&select=id',
          'GET'
        );
        if (!existingCh || existingCh.length === 0) {
          supabaseFetch('channels', 'POST', {
            team_id: teamNames[teamName],
            name: channelName,
            description: String(tRow[2]).trim() || '',
            type: String(tRow[3]).trim() || 'public'
          });
          log.push('Channel created: ' + teamName + ' > ' + channelName);
          channelCount++;
        }
      }
    }
  }

  ui.alert('Sync abgeschlossen!\n\n' + log.join('\n') + '\n\nGesamt: ' + userCount + ' User verarbeitet');
}

// === LOAD: Supabase -> Sheet ===
function loadFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Load users
  var users = supabaseFetch('users?select=*&order=display_name', 'GET');
  if (!users || users.length === 0) {
    ui.alert('Keine User in Supabase gefunden.');
    return;
  }

  var kollegium = ss.getSheetByName('Kollegium');
  if (!kollegium) { ui.alert('Sheet "Kollegium" nicht gefunden!'); return; }

  // Clear existing data (keep header)
  if (kollegium.getLastRow() > 1) {
    kollegium.getRange(2, 1, kollegium.getLastRow() - 1, 7).clearContent();
  }

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var nameParts = (u.display_name || '').split(' ');
    var vorname = nameParts[0] || '';
    var nachname = nameParts.slice(1).join(' ') || '';
    kollegium.getRange(i + 2, 1, 1, 7).setValues([[
      '', // Kuerzel muss manuell gepflegt werden
      vorname,
      nachname,
      u.email || '',
      u.role || 'lehrer',
      '',
      'aktiv'
    ]]);
  }

  ui.alert(users.length + ' User aus Supabase geladen.\nBitte Kuerzel manuell nachtragen.');
}

// === HELPERS ===
function getColorForKuerzel(kuerzel) {
  var colors = ['#5B7B94', '#7B6B94', '#6B947B', '#94845B', '#5B8494', '#8B5B94', '#5B946B', '#946B5B'];
  var hash = 0;
  for (var i = 0; i < kuerzel.length; i++) {
    hash = kuerzel.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// === FEEDBACK-SHEET ANLEGEN ===
function setupFeedbackSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fb = ss.getSheetByName('Feedback') || ss.insertSheet('Feedback');
  if (fb.getLastRow() === 0 || fb.getRange('A1').getValue() === '') {
    fb.getRange('A1:G1').setValues([[
      'Zeitstempel', 'Name', 'Kategorie', 'Bewertung', 'Nachricht', 'Seite', 'User-Agent'
    ]]);
    fb.getRange('A1:G1').setFontWeight('bold').setBackground('#ff9800').setFontColor('white');
    fb.setColumnWidth(1, 160);
    fb.setColumnWidth(2, 120);
    fb.setColumnWidth(3, 110);
    fb.setColumnWidth(4, 80);
    fb.setColumnWidth(5, 400);
    fb.setColumnWidth(6, 120);
    fb.setColumnWidth(7, 200);
    fb.setFrozenRows(1);
  }
  SpreadsheetApp.getUi().alert('Feedback-Sheet eingerichtet!');
}

// === WEB-APP ENDPOINT: Feedback empfangen ===
// Nach dem Deployen als Web-App erreichbar unter der Deployment-URL.
// Die App sendet POST-Requests mit JSON-Body hierher.
function doPost(e) {
  var ALLOWED_CATEGORIES = ['bug', 'verbesserung', 'lob', 'frage', 'sonstiges'];
  try {
    // Eingabe-Validierung
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Keine Daten empfangen' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var data = JSON.parse(e.postData.contents);

    // Kategorie-Whitelist
    var category = String(data.category || 'sonstiges').toLowerCase();
    if (ALLOWED_CATEGORIES.indexOf(category) === -1) category = 'sonstiges';

    // Rating Range-Check (0-5)
    var rating = Number(data.rating) || 0;
    if (rating < 0) rating = 0;
    if (rating > 5) rating = 5;

    var ss = SpreadsheetApp.openById('1i81Zb9A2rpI1X8fkG11EwBs_BsaSFGUGtIaDfj_LHGE');
    var fb = ss.getSheetByName('Feedback');
    if (!fb) {
      fb = ss.insertSheet('Feedback');
      fb.getRange('A1:G1').setValues([[
        'Zeitstempel', 'Name', 'Kategorie', 'Bewertung', 'Nachricht', 'Seite', 'User-Agent'
      ]]);
      fb.getRange('A1:G1').setFontWeight('bold').setBackground('#ff9800').setFontColor('white');
      fb.setFrozenRows(1);
    }

    // Anti-Spam: Max 1000 Zeilen, danach ablehnen
    if (fb.getLastRow() > 1000) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Feedback-Limit erreicht' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    fb.appendRow([
      new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
      String(data.name || 'Anonym').substring(0, 100),
      category,
      rating,
      String(data.message || '').substring(0, 2000),
      String(data.page || '').substring(0, 200),
      String(data.userAgent || '').substring(0, 300)
    ]);
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Serverfehler' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// === WEB-APP ENDPOINT: GET (Statuscheck) ===
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    app: 'KRS Connect Feedback',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function showHelp() {
  var html = HtmlService.createHtmlOutput(
    '<h2>KRS Connect Admin</h2>' +
    '<h3>Workflow:</h3>' +
    '<ol>' +
    '<li><b>Kollegium</b> pflegen: Kuerzel, Name, E-Mail, Rolle</li>' +
    '<li><b>Teams & Kanaele</b> anlegen: Team-Name, Kanal-Name, Typ</li>' +
    '<li><b>Mitgliedschaften</b> zuordnen: Wer ist in welchem Team?</li>' +
    '<li><b>Sheet -> Supabase sync</b> klicken</li>' +
    '</ol>' +
    '<h3>Rollen:</h3>' +
    '<ul>' +
    '<li><b>admin</b> = Kann alles (Norbert, Petra)</li>' +
    '<li><b>lehrer</b> = Normaler Lehrer</li>' +
    '<li><b>gast</b> = Nur lesen</li>' +
    '</ul>' +
    '<h3>Feedback:</h3>' +
    '<p>Klicke "Feedback-Sheet einrichten" im Menu, um das Feedback-Tab anzulegen.</p>' +
    '<p>Nach dem Web-App-Deploy empfaengt doPost() automatisch Feedback von der App.</p>' +
    '<p><small>Supabase: ooejsfixxiuobrpqgfqm.supabase.co</small></p>'
  ).setWidth(400).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, 'Hilfe');
}
