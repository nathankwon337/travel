/**
 * 2026 유럽여행 사이트 - 구글시트 연동용 Apps Script
 *
 * 이 파일은 구글 스프레드시트에 연결된 Apps Script 프로젝트(Code.gs)에
 * 그대로 붙여넣어 사용합니다. 자세한 설정 방법은 GOOGLE_SHEETS_SETUP.md 참고.
 *
 * 시트 구조 (처음 실행 시 자동 생성됨):
 *   Checklist    : Key | Done | UpdatedAt
 *   Reservations : Key | Paid | UpdatedAt
 *   Memos        : Id | Date | Type | Text | Title | Amount | Currency | CreatedAt
 */

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  var range = sheet.getRange(1, 1, 1, headers.length);
  var values = range.getValues()[0];
  var isEmpty = values.every(function (v) { return v === '' || v === null; });
  if (isEmpty) {
    range.setValues([headers]);
  }
}

function readKeyValueSheet_(name) {
  var sheet = getSheet_(name);
  var data = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    if (key) result[key] = data[i][1];
  }
  return result;
}

function upsertKeyValue_(name, headers, key, value) {
  var sheet = getSheet_(name);
  ensureHeaders_(sheet, headers);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(value);
      sheet.getRange(i + 1, 3).setValue(new Date());
      return;
    }
  }
  sheet.appendRow([key, value, new Date()]);
}

function doGet(e) {
  ensureHeaders_(getSheet_('Checklist'), ['Key', 'Done', 'UpdatedAt']);
  ensureHeaders_(getSheet_('Reservations'), ['Key', 'Paid', 'UpdatedAt']);
  ensureHeaders_(getSheet_('Memos'), ['Id', 'Date', 'Type', 'Text', 'Title', 'Amount', 'Currency', 'CreatedAt']);

  var checklist = readKeyValueSheet_('Checklist');
  var reservations = readKeyValueSheet_('Reservations');

  var memoSheet = getSheet_('Memos');
  var memoData = memoSheet.getDataRange().getValues();
  var memos = [];
  for (var i = 1; i < memoData.length; i++) {
    var row = memoData[i];
    if (!row[0]) continue;
    memos.push({
      id: row[0],
      date: row[1] instanceof Date ? Utilities.formatDate(row[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : row[1],
      type: row[2],
      text: row[3],
      title: row[4],
      amount: row[5],
      currency: row[6]
    });
  }

  var out = { checklist: checklist, reservations: reservations, memos: memos };
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var action = body.action;

  if (action === 'setChecklist') {
    upsertKeyValue_('Checklist', ['Key', 'Done', 'UpdatedAt'], body.key, body.done);
  } else if (action === 'setReservation') {
    upsertKeyValue_('Reservations', ['Key', 'Paid', 'UpdatedAt'], body.key, body.paid);
  } else if (action === 'addMemo') {
    var sheet = getSheet_('Memos');
    ensureHeaders_(sheet, ['Id', 'Date', 'Type', 'Text', 'Title', 'Amount', 'Currency', 'CreatedAt']);
    var m = body.memo;
    sheet.appendRow([m.id, m.date, m.type, m.text || '', m.title || '', m.amount || '', m.currency || '', new Date()]);
  } else if (action === 'deleteMemo') {
    var sheet = getSheet_('Memos');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(body.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
