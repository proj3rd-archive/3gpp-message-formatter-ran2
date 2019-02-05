"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var xlsx = require('excel4node');
var fillWhite = {
    type: 'pattern',
    patternType: 'solid',
    fgColor: 'FFFFFF'
};
var borderTop = { top: { style: 'thin' } };
var borderLeft = { left: { style: 'thin' } };
var borderTopLeft = { top: { style: 'thin' }, left: { style: 'thin' } };
var borderAll = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
};
function toWorkbook(messageIEname, messageIE, depthMax) {
    let workbook = new xlsx.Workbook();
    let sheetname = messageIEname.substring(0, 30);
    let worksheet = workbook.addWorksheet(sheetname, {
        outline: {
            summaryBelow: false
        }
    });
    fillWorksheet(worksheet, messageIE, depthMax);
    return workbook;
}
exports.toWorkbook = toWorkbook;
function fillWorksheet(ws, messageIE, depthMax) {
    for (let i = 0; i < depthMax; i++) {
        ws.column(i + 1).setWidth(3);
    }
    ws.column(depthMax + 1).setWidth(30);
    let rowNum = 1;
    ws.cell(rowNum, 1).string('IE').style({
        fill: fillWhite,
        border: borderTopLeft
    });
    ws.cell(rowNum, 2, rowNum, depthMax + 1).style({
        fill: fillWhite,
        border: borderTop
    });
    ws.cell(rowNum, depthMax + 2).string('M/O/C');
    ws.cell(rowNum, depthMax + 3).string('Need code/Condition');
    ws.cell(rowNum, depthMax + 4).string('Sub IE');
    ws.cell(rowNum, depthMax + 5).string('Type/Description');
    ws.cell(rowNum, depthMax + 6).string('DEFAULT');
    ws.cell(rowNum, depthMax + 2, rowNum, depthMax + 6).style({
        fill: fillWhite,
        border: borderTop
    });
    rowNum = preorderHelper(ws, messageIE, ++rowNum, depthMax);
    if (Object.keys(messageIE['constants']).length) {
        rowNum++;
        ws.cell(rowNum, 1, rowNum, depthMax + 2, true).string('Constants').style({
            fill: fillWhite,
            border: borderAll
        });
        for (let key in messageIE['constants']) {
            rowNum++;
            ws.cell(rowNum, 1, rowNum, depthMax + 1, true).string(key).style({
                fill: fillWhite,
                border: borderAll
            });
            ws.cell(rowNum, depthMax + 2).number(messageIE['constants'][key]['value']).style({
                fill: fillWhite,
                border: borderAll
            });
        }
    }
}
exports.fillWorksheet = fillWorksheet;
function preorderHelper(ws, messageIE, rowNum, depthMax, depth = 0, isChoicable = false) {
    if (Object.keys(messageIE).length == 1 && 'module' in messageIE) {
        return rowNum;
    }
    if ('extensionAdditionGroup' in messageIE) {
        let rowGroupSummary = rowNum;
        ws.cell(rowNum, 1, rowNum, depth).style({
            fill: fillWhite,
            border: borderLeft
        });
        ws.cell(rowNum, depth + 1).string('[[').style({
            fill: fillWhite,
            border: borderTopLeft
        });
        ws.cell(rowNum, depth + 2, rowNum, depthMax + 6).style({
            fill: fillWhite,
            border: borderTop
        });
        rowNum++;
        for (let item of messageIE['extensionAdditionGroup']) {
            rowNum = preorderHelper(ws, item, rowNum, depthMax, depth + 1, isChoicable);
        }
        ws.cell(rowNum, 1, rowNum, depth).style({
            fill: fillWhite,
            border: borderLeft
        });
        ws.cell(rowNum, depth + 1).string(']]').style({
            fill: fillWhite,
            border: borderTopLeft
        });
        ws.cell(rowNum, depth + 2, rowNum, depthMax + 6).style({
            fill: fillWhite,
            border: borderTop
        });
        if (depth + 1 < 8) {
            for (let i = rowGroupSummary + 1; i <= rowNum; i++) {
                if (ws.row(i).outlineLevel === null) {
                    ws.row(i).group(depth + 1);
                }
            }
        }
        rowNum++;
    }
    else {
        let row = [];
        let k = depth ? depth + 1 : 1;
        // name
        if ('name' in messageIE) {
            if (messageIE['name'] == '...') {
                return rowNum;
            }
            ws.cell(rowNum, k++).string(messageIE['name']).style({
                fill: fillWhite,
                border: borderTopLeft
            });
        }
        else {
            ws.cell(rowNum, k++).style({
                fill: fillWhite,
                border: borderLeft
            });
        }
        ws.cell(rowNum, 1, rowNum, depth + 1).style({
            fill: fillWhite,
            border: borderLeft
        });
        ws.cell(rowNum, k, rowNum, k + (depthMax - depth)).style({
            fill: fillWhite,
            border: borderTop
        });
        k = depthMax + 2;
        // Optional, Conditional, Mandatory
        let MOC = '';
        if ('optional' in messageIE) {
            MOC = 'O';
        }
        else if (isChoicable) {
            MOC = 'C';
        }
        else {
            MOC = 'M';
        }
        ws.cell(rowNum, k++).string(MOC).style({
            fill: fillWhite,
            border: borderTop
        });
        // Choice
        isChoicable = false;
        if (messageIE['type'].includes('CHOICE')) {
            isChoicable = true;
        }
        // Need code, condition
        let needCode = '';
        if ('needCode' in messageIE) {
            needCode = messageIE['needCode'].substring(3);
        }
        else if ('condition' in messageIE) {
            needCode = `Cond ${messageIE['condition']}`;
        }
        ws.cell(rowNum, k++).string(needCode).style({
            fill: fillWhite,
            border: borderTop
        });
        // Custom IE name
        let subIe = '';
        if ('subIE' in messageIE) {
            subIe = messageIE['subIE'];
        }
        ws.cell(rowNum, k++).string(subIe).style({
            fill: fillWhite,
            border: borderTop
        });
        // Actual type
        let type = '';
        if ('type' in messageIE) {
            type = messageIE['type'];
        }
        ws.cell(rowNum, k++).string(type).style({
            fill: fillWhite,
            border: borderTop
        });
        let defaultValue = '';
        if ('default' in messageIE) {
            defaultValue = `${messageIE['default']}`;
        }
        ws.cell(rowNum, k++).string(defaultValue).style({
            fill: fillWhite,
            border: borderTop
        });
        let rowGroupSummary = rowNum++;
        if ('content' in messageIE) {
            for (let item of messageIE['content']) {
                rowNum = preorderHelper(ws, item, rowNum, depthMax, depth + 1, isChoicable);
            }
            if (depth + 1 < 8 && rowNum > rowGroupSummary + 1) {
                for (let i = rowGroupSummary + 1; i < rowNum; i++) {
                    if (ws.row(i).outlineLevel === null) {
                        ws.row(i).group(depth + 1);
                    }
                }
            }
        }
    }
    return rowNum;
}
