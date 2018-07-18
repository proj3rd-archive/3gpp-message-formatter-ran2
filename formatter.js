var fs = require('fs');
var path = require('path');
var readline = require('readline-sync');
var xlsx = require('@gsongsong/xlsx');
var extract = require('third-gen-asn1-extractor');
var parser = require('third-gen-asn1-parser');

module.exports = exports = format;

var builtIns = ['BIT STRING', 'BOOLEAN', 'ENUMERATED', 'INTEGER', 'NULL',
                'OCTET STRING', 'CHOICE', 'SEQUENCE', 'SEQUENCE OF',
                'BIT', 'OCTET' /* HACK */];

function format(messageIEname, asn1Json) {
    let worksheets = [];
    if (messageIEname == '__all') {
        let idx = 0;
        for (let moduleName in asn1Json) {
            for (let definition in asn1Json[moduleName]) {
                if (definition == 'import') {
                    continue;
                }
                let messageIE = JSON.parse(JSON.stringify(
                                            asn1Json[moduleName][definition]));
                messageIEHelper(messageIE, definition);
                if (messageIE['type'] == 'INTEGER') {
                    continue;
                }
                console.log(`Formatting ${moduleName}/${definition}...`);
                let depthMax = expand(messageIE, asn1Json);
                // logJson(messageIE);
                let idxString = String(idx);
                worksheets.push(toWorksheet(
                    `${definition.substring(0, 30 - (idxString.length + 1))} ${idxString}`,
                    messageIE, depthMax));
                idx++;
            }
        }
    } else {
        let messageIE = getUniqueMessageIE(messageIEname, asn1Json);
        messageIEHelper(messageIE, messageIEname);
        console.log(`Formatting ${messageIE['module']}/${messageIEname}...`);
        let depthMax = expand(messageIE, asn1Json);
        // logJson(messageIE);
        worksheets.push(toWorksheet(messageIEname, messageIE, depthMax));
    }
    return toWorkbook(worksheets);
}

function messageIEHelper(messageIE, messageIEname) {
    messageIE['name'] = messageIEname;
    delete messageIE['inventory'];
}

function expand(messageIE, asn1Json, depth = 0) {
    // TODO: more elegant way?
    if (!('constants' in messageIE)) {
        messageIE['constants'] = {};
    }
    let depthMax = depth;
    if ('type' in messageIE) {
        switch (messageIE['type']) {
            case 'BOOLEAN':
            case 'NULL':
                break;
            case 'BIT STRING':
                messageIE['type'] += ` ${getSizeExpression(messageIE, asn1Json)}`;
                delete messageIE['size'];
                delete messageIE['sizeMin'];
                delete messageIE['sizeMax'];
                break;
            case 'ENUMERATED':
                messageIE['type'] += ` {${messageIE['content'].join(', ')}}`;
                delete messageIE['content'];
                break;
            case 'INTEGER':
                messageIE['type'] += ` ${integerHelper(messageIE, asn1Json)}`;
                delete messageIE['value'];
                delete messageIE['start'];
                delete messageIE['end'];
                break;
            case 'OCTET STRING':
                if ('containing' in messageIE) {
                    let containedName = messageIE['containing'];
                    delete messageIE['containing'];
                    messageIE['type'] += ` (CONTAINING ${containedName})`;
                    let containedIE = getUniqueMessageIE(containedName,
                                                            asn1Json);
                    delete containedIE['inventory'];
                    messageIE['content'] = [containedIE];
                    messageIE['content'][0]['name'] = containedName;
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(item, asn1Json, depth + 1));
                        mergeConstants(messageIE, item);
                    }
                }
                break;
            case 'SEQUENCE OF':
                let memberName = messageIE['member']['type'];
                messageIE['type'] = `SEQUENCE ${getSizeExpression(messageIE, asn1Json)} OF ${messageIE['member']['type']} ${integerHelper(messageIE['member'], asn1Json)}`;
                delete messageIE['member'];
                delete messageIE['size'];
                delete messageIE['sizeMin'];
                delete messageIE['sizeMax'];
                if (!builtIns.includes(memberName)) {
                    let memberIE = getUniqueMessageIE(memberName, asn1Json);
                    delete memberIE['inventory'];
                    messageIE['content'] = [memberIE];
                    messageIE['content'][0]['name'] = memberName;
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(item, asn1Json, depth + 1));
                        mergeConstants(messageIE, item);
                    }
                }
                break;
            case 'CHOICE':
            case 'SEQUENCE':
                for (let item of messageIE['content'] ) {
                    depthMax = Math.max(depthMax, expand(item, asn1Json, depth + 1));
                    mergeConstants(messageIE, item);
                }
                break;
            default:
                if (!builtIns.includes(messageIE['type'].split(' ')[0])) {
                    if ('parameters' in messageIE) {
                        if (messageIE['parameters'].length) {
                            console.log('Original');
                            console.log(JSON.stringify(messageIE, null, 2));
                            console.log('');
                            let type = getUniqueMessageIE(messageIE['type'],
                                                            asn1Json);
                            let arguments = messageIE['parameters'];
                            console.log(messageIE['type']);
                            console.log(JSON.stringify(type, null, 2));
                            console.log('');
                            substituteArguments(type, messageIE['param']);
                            messageIE['subIE'] = `${messageIE['type']} {${messageIE['parameters']
                                                                .join(', ')}}`;
                            Object.assign(messageIE, type);
                            // depthMax = Math.max(depthMax, expand(item, asn1Json, depth)); // TODO
                            console.log('Modified');
                            console.log(JSON.stringify(messageIE, null, 2));
                            console.log('');
                            console.log('');
                        }
                        messageIE['parameters'] = [];
                    } else {
                        if (!messageIE['isParameter']) {
                            messageIE['subIE'] = messageIE['type'];
                            let type = getUniqueMessageIE(messageIE['type'],
                                                            asn1Json);
                            delete type['inventory'];
                            Object.assign(messageIE, type);
                            if ('content' in messageIE) {
                                // messageIE['content'][0]['name'] = messageIE['subIE'];
                            }
                            depthMax = Math.max(depthMax, expand(messageIE, asn1Json, depth));
                        }
                    }
                }
                if ('content' in messageIE) {
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(item, asn1Json, depth + 1));
                        mergeConstants(messageIE, item);
                    }
                }
                break;
        }
    } else if ('name' in messageIE) {
        delete messageIE['name'];
    } else if ('extensionAdditionGroup' in messageIE) {
        // TODO: This is experimental
        for (let item of messageIE['extensionAdditionGroup']) {
            depthMax = Math.max(depthMax, expand(item, asn1Json, depth));
        }
    }
    return depthMax;
}

function substituteArguments(messageIE, arguments) {
    // TODO
    delete messageIE['parameterisedType'];
    delete messageIE['parameters'];
}

function mergeConstants(parentIE, childIE) {
    for (let key in childIE['constants']) {
        parentIE['constants'][key] = childIE['constants'][key];
    }
    delete childIE['constants'];
}

function toWorksheet(sheetname, messageIE, depthMax) {
    let worksheet_data = [];
    let styles = {};
    let rowNum = 1;
    let header = [];
    header.push('IE');
    styles[cellAddress(rowNum, 1)] = 3;
    for (let i = 0; i < depthMax; i++) {
        header.push(null);
        styles[cellAddress(rowNum, 2)] = 1;
    }
    header.push('M/O/C', 'Need code/Condition', 'Sub IE', 'Type/Description', 'DEFAULT');
    for (let i = 0; i < header.length; i++) {
        styles[cellAddress(rowNum, depthMax + i + 1)] = 1;
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
        worksheet['!cols'].push({wch: 3});
    }
    for (let cell in styles) {
        if (!(cell in worksheet)) {
            worksheet[cell] = {};
        }
        worksheet[cell]['s'] = styles[cell];
    }
    sheetname = sheetname.substring(0, 30);
    return {sheetname: sheetname, worksheet: worksheet};
}

function toWorkbook(worksheets) {
    let workbook = xlsx.utils.book_new();
    workbook['Styles'] = {};
    let style = workbook['Styles'];
    style['Fills'] = [{patternType: 'none'},
                        {patternType: 'gray125'},
                        {patternType: 'solid', fgColor: {theme: 0},
                            bgColor: {indexed: 64}}];
    style['Borders'] = [{},
                        {top: {style: 'thin'}},
                        {left: {style: 'thin'}},
                        {top: {style: 'thin'}, left: {style: 'thin'}}];
    style['CellXf'] = [{numFmtId: 0, fontId: 0, fillId: 0, borderId: 0,
                        xfId: 0},
                        {numFmtId: 0, fontId: 0, fillId: 2, borderId: 1,
                        xfId: 0, applyBorder: true},
                        {numFmtId: 0, fontId: 0, fillId: 2, borderId: 2,
                        xfId: 0, applyBorder: true},
                        {numFmtId: 0, fontId: 0, fillId: 2, borderId: 3,
                        xfId: 0, applyBorder: true}];
    for (let worksheet of worksheets) {
        xlsx.utils.book_append_sheet(workbook,
                                        worksheet['worksheet'],
                                        worksheet['sheetname']);
    }
    return workbook;
}

function preorderHelper(worksheet_data, messageIE, styles, rowNum, depthMax,
                        depth = 0, isChoicable = false) {
    if (!Object.keys(messageIE).length) {
        return rowNum;
    }
    if ('extensionAdditionGroup' in messageIE) {
        worksheet_data.push(['[[']);
        styles[cellAddress(rowNum, 1)] = 3;
        rowNum++;
        for (let item of messageIE['extensionAdditionGroup']) {
            rowNum = preorderHelper(worksheet_data, item, styles, rowNum,
                                    depthMax, depth);
        }
        worksheet_data.push([']]']);
        styles[cellAddress(rowNum, 1)] = 3;
        rowNum++;
    } else {
        let row = [];
        let k = 0;
        for (let i = 0; i < depth; i++) {
            row.push(null);
            styles[cellAddress(rowNum, i + 1)] = 2;
            k = i;
        }
        k++;
        // name
        if ('name' in messageIE) {
            row.push(messageIE['name']);
            styles[cellAddress(rowNum, k + 1)] = 3;
        } else {
            row.push(null);
            styles[cellAddress(rowNum, k + 1)] = 2;
        }
        k++;
        for (let i = depth; i < depthMax; i++) {
            row.push(null);
            styles[cellAddress(rowNum, k + 1)] = 1;
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
        styles[cellAddress(rowNum, k + 1)] = 1;
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
        styles[cellAddress(rowNum, k + 1)] = 1;
        k++;
        // Custom IE name
        if ('subIE' in messageIE) {
            row.push(messageIE['subIE']);
        } else {
            row.push(null);
        }
        styles[cellAddress(rowNum, k + 1)] = 1;
        k++;
        // Actual type
        if ('type' in messageIE) {
            row.push(messageIE['type']);
        } else {
            row.push(null);
        }
        styles[cellAddress(rowNum, k + 1)] = 1;
        k++;
        if ('default' in messageIE) {
            row.push(messageIE['default']);
        }
        styles[cellAddress(rowNum, k + 1)] = 1;
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

function getUniqueMessageIE(messageIEname, asn1Json) {
    let messageIEs = parser.getAsn1ByName(messageIEname, asn1Json);
    let modules = Object.keys(messageIEs);
    let idx = 0;
    switch (modules.length) {
        case 0:
            throw `No message/IE found`;
            break;
        case 1:
            break;
        default:
            console.log(`'${messageIEname}' is defined in multiple modules.`);
            for (let i = 0; i < modules.length; i++) {
                console.log(`${i}: ${modules[i]}`);
            }
            let idx = readline.questionInt('Which one? ');
            break;
    }
    return Object.assign(JSON.parse(JSON.stringify(messageIEs[modules[idx]])),
                            {'module': modules[idx], 'constants': {}});
}

function integerHelper(messageIE, asn1Json) {
    let ret = '';
    // TODO: more elegant way?
    if (!('constants' in messageIE)) {
        messageIE['constants'] = {};
    }
    if ('value' in messageIE || 'start' in messageIE) {
        ret += '(';
        if ('value' in messageIE) {
            let value = messageIE['value'];
            if (Number(value) != value) {
                messageIE['constants'][value] = getUniqueMessageIE(value,
                                                                    asn1Json);
            }
            ret += value;
        } else if ('start' in messageIE) {
            let start = messageIE['start'];
            let end = messageIE['end'];
            if (Number(start) != start) {
                messageIE['constants'][start] = getUniqueMessageIE(start,
                                                                    asn1Json);
            }
            if (Number(end) != end) {
                messageIE['constants'][end] = getUniqueMessageIE(end,
                                                                    asn1Json);
            }
            ret += `${start}..${end}`;
        }
        ret += ')';
    }
    return ret;
}

function getSizeExpression(messageIE, asn1Json) {
    let ret = '';
    // TODO: more elegant way?
    if (!('constants' in messageIE)) {
        messageIE['constants'] = {};
    }
    if ('size' in messageIE || 'sizeMin' in messageIE) {
        ret = '(SIZE(';
        if ('size' in messageIE) {
            let size = messageIE['size'];
            if (Number(size) != size) {
                messageIE['constants'][size] = getUniqueMessageIE(size,
                                                                    asn1Json);
            }
            ret += size;
        } else if ('sizeMin' in messageIE) {
            let sizeMin = messageIE['sizeMin'];
            let sizeMax = messageIE['sizeMax'];
            if (Number(sizeMin) != sizeMin) {
                messageIE['constants'][sizeMin] = getUniqueMessageIE(sizeMin,
                                                                     asn1Json);
            }
            if (Number(sizeMax) != sizeMax) {
                messageIE['constants'][sizeMax] = getUniqueMessageIE(sizeMax,
                                                                     asn1Json);
            }
            ret += `${sizeMin}..${sizeMax}`;
        }
        ret += '))';
    }
    return ret;
}

function cellAddress(r, c) {
    let address = base26(c) + r;
    return address;
}

// 1: A, 2: B, ..., 27: AA
function base26(num) {
    var c = [];
    while (num) {
        let r = num % 26;
        c.splice(0, 0, String.fromCharCode('A'.charCodeAt(0) + r - 1));
        num = (num - r) / 26;
    }
    return c.join('');
}

if (require.main == module) {
    if (process.argv.length >= 4) {
        let inputFile = path.parse(process.argv[2]);
        let input = extract(fs.readFileSync(path.resolve(process.cwd(),
                                                            inputFile['dir'],
                                                            inputFile['base']),
                                            'utf8'));
        let messageIEname = process.argv[3];
        let asn1Json = parser.parse(input);
        let outputFile;
        if (messageIEname == '__all') {
            outputFile = `${inputFile['name']}.xlsx`;
        } else {
            outputFile = `${messageIEname}.xlsx`;
        }
        xlsx.writeFile(format(messageIEname, asn1Json), outputFile);
    } else {
        console.log('Usage: node formatter <file_name> <message/IE>');
        console.log('  ex : node formatter 38331-f10.asn1 RRCReconfiguration');
    } 
}

function logJson(json) {
    console.log(JSON.stringify(json, null, 2));
}