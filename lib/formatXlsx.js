var xlsx = require('@gsongsong/xlsx');
var addr = xlsx.utils.encode_cell;
var cell = xlsx.utils.decode_cell;

exports.toWorkbook = toWorkbook;
exports.toWorksheet = toWorksheet;

var fillWhite = { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } }
var borderTop = { top: { style: 'thin' } };
var borderLeft = { left: { style: 'thin' } };
var borderTopLeft = { top: { style: 'thin' }, left: { style: 'thin' } };

function toWorkbook(worksheets, styles) {
    let workbook = xlsx.utils.book_new();
    for (let i = 0; i < worksheets.length; i++) {
        let worksheet = worksheets[i];
        let style = styles[i];
        for (let address in style) {
            if ('fill' in style[address]) {
                xlsx.utils.set_fill(workbook, worksheet['worksheet'], cell(address), style[address]['fill']);
            }
            if ('border' in style[address]) {
                xlsx.utils.set_border(workbook, worksheet['worksheet'], cell(address), style[address]['border']);
            }
        }
    }
    for (let worksheet of worksheets) {
        xlsx.utils.book_append_sheet(workbook,
            worksheet['worksheet'],
            worksheet['sheetname']);
    }
    return workbook;
}

function toWorksheet(sheetname, messageIE, depthMax) {
    let worksheet_data = [];
    let styles = {};
    let rowNum = 0;
    let header = [];
    header.push('IE');
    styles[addr({ c: 0, r: rowNum })] = { fill: fillWhite, border: borderTopLeft };
    for (let i = 0; i < depthMax; i++) {
        header.push(null);
        styles[addr({ c: i + 1, r: rowNum })] = { fill: fillWhite, border: borderTop };
    }
    header.push('M/O/C', 'Need code/Condition', 'Sub IE', 'Type/Description', 'DEFAULT');
    for (let i = 0; i < header.length; i++) {
        styles[addr({ c: i + depthMax, r: rowNum })] = { fill: fillWhite, border: borderTop };
    }
    worksheet_data.push(header);
    rowNum++;
    preorderHelper(worksheet_data, messageIE, styles, rowNum, depthMax);
    if (Object.keys(messageIE['constants']).length) {
        worksheet_data.push([null]);
        worksheet_data.push(['Constants']);
        for (let key in messageIE['constants']) {
            let row = [key, messageIE['constants'][key]['value']];
            for (let i = 0; i < depthMax; i++) {
                row.splice(1, 0, null);
            }
            worksheet_data.push(row);
        }
    }
    let worksheet = xlsx.utils.aoa_to_sheet(worksheet_data);
    worksheet['!cols'] = [];
    for (let i = 0; i < depthMax; i++) {
        worksheet['!cols'].push({ wch: 3 });
    }
    for (let cell in styles) {
        if (!(cell in worksheet)) {
            worksheet[cell] = {};
        }
    }
    sheetname = sheetname.substring(0, 30);
    return {
        worksheet: { sheetname: sheetname, worksheet: worksheet },
        style: styles
    };
}

function preorderHelper(worksheet_data, messageIE, styles, rowNum, depthMax,
    depth = 0, isChoicable = false) {
    if (Object.keys(messageIE).length == 1 && 'module' in messageIE) {
        return rowNum;
    }
    if ('extensionAdditionGroup' in messageIE) {
        worksheet_data.push(['[[']);
        styles[addr({ c: 0, r: rowNum })] = { fill: fillWhite, border: borderTopLeft };
        rowNum++;
        for (let item of messageIE['extensionAdditionGroup']) {
            rowNum = preorderHelper(worksheet_data, item, styles, rowNum,
                depthMax, depth, isChoicable);
        }
        worksheet_data.push([']]']);
        styles[addr({ c: 0, r: rowNum })] = { fill: fillWhite, border: borderTopLeft };
        rowNum++;
    } else {
        let row = [];
        let k = 0;
        for (let i = 0; i < depth; i++) {
            row.push(null);
            styles[addr({ c: i, r: rowNum })] = { fill: fillWhite, border: borderLeft };
            k = i;
        }
        if (depth) k++;
        // name
        if ('name' in messageIE) {
            row.push(messageIE['name']);
            styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTopLeft };
        } else {
            row.push(null);
            styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderLeft };
        }
        k++;
        for (let i = depth; i < depthMax; i++) {
            row.push(null);
            styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTop };
            k++;
        }
        // Optional, Conditional, Mandatory
        if ('optional' in messageIE) {
            row.push('O');
        } else if (isChoicable) {
            row.push('C');
        } else {
            row.push('M');
        }
        styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTop };
        k++;
        // Choice
        isChoicable = false;
        if (messageIE['type'] == 'CHOICE') {
            isChoicable = true;
        }
        // Need code, condition
        if ('needCode' in messageIE) {
            row.push(messageIE['needCode'].substring(3));
        } else if ('condition' in messageIE) {
            row.push(`Cond ${messageIE['condition']}`);
        } else {
            row.push(null);
        }
        styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTop };
        k++;
        // Custom IE name
        if ('subIE' in messageIE) {
            row.push(messageIE['subIE']);
        } else {
            row.push(null);
        }
        styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTop };
        k++;
        // Actual type
        if ('type' in messageIE) {
            row.push(messageIE['type']);
        } else {
            row.push(null);
        }
        styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTop };
        k++;
        if ('default' in messageIE) {
            row.push(messageIE['default']);
        }
        styles[addr({ c: k, r: rowNum })] = { fill: fillWhite, border: borderTop };
        k++;
        worksheet_data.push(row);
        rowNum++;
        if ('content' in messageIE) {
            for (let item of messageIE['content']) {
                rowNum = preorderHelper(worksheet_data, item, styles, rowNum,
                    depthMax, depth + 1, isChoicable);
            }
        }
    }
    return rowNum;
}
