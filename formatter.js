var fs = require('fs');
var path = require('path');
var xlsx = require('xlsx');
var extract = require('3gpp-asn1-extractor');
var parser = require('3gpp-asn1-parser');

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
        let messageIE = getUniqueMessageIE(parser.getAsn1ByName(messageIEname,
                                                                asn1Json));
        messageIEHelper(messageIE, messageIEname);
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
                    let containedIE = getUniqueMessageIE(parser.getAsn1ByName(
                                                    containedName, asn1Json));
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
                    let memberIE = getUniqueMessageIE(parser.getAsn1ByName(
                                                            memberName, asn1Json));
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
                            messageIE['type'] += ` {${messageIE['parameters']
                                                                .join(', ')}}`;
                        }
                        messageIE['parameters'] = [];
                    } else {
                        if (!messageIE['isParameter']) {
                            messageIE['subIE'] = messageIE['type'];
                            let type = getUniqueMessageIE(parser.getAsn1ByName(
                                                            messageIE['type'], asn1Json));
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

function mergeConstants(parentIE, childIE) {
    for (let key in childIE['constants']) {
        parentIE['constants'][key] = childIE['constants'][key];
    }
    delete childIE['constants'];
}

function toWorksheet(sheetname, messageIE, depthMax) {
    let worksheet_data = [];
    let header = [];
    header.push('IE');
    for (let i = 0; i < depthMax; i++) {
        header.push(null);
    }
    header.push('M/O/C', 'Need code/Condition', 'Sub IE', 'Type/Description', 'DEFAULT');
    worksheet_data.push(header);
    preorderHelper(worksheet_data, messageIE, depthMax);
    if (Object.keys(messageIE['constants']).length) {
        worksheet_data.push([null]);
    }
    worksheet_data.push(['Constants']);
    for (let key in messageIE['constants']) {
        let row = [key, messageIE['constants'][key]['value']];
        for (let i = 0; i < depthMax; i++) {
            row.splice(1, 0, null);
        }
        worksheet_data.push(row);
    }
    let worksheet = xlsx.utils.aoa_to_sheet(worksheet_data);
    sheetname = sheetname.substring(0, 30);
    return {sheetname: sheetname, worksheet: worksheet};
}

function toWorkbook(worksheets) {
    let workbook = xlsx.utils.book_new();
    for (let worksheet of worksheets) {
        xlsx.utils.book_append_sheet(workbook,
                                        worksheet['worksheet'],
                                        worksheet['sheetname']);
    }
    return workbook;
}

function preorderHelper(worksheet_data, messageIE, depthMax, depth = 0,
                        isChoicable = false) {
    if (!Object.keys(messageIE).length) {
        return;
    }
    if ('extensionAdditionGroup' in messageIE) {
        worksheet_data.push(['[[']);
        for (let item of messageIE['extensionAdditionGroup']) {
            preorderHelper(worksheet_data, item, depthMax, depth);
        }
        worksheet_data.push([']]']);
    } else {
        let row = [];
        for (let i = 0; i < depth; i++) {
            row.push(null);
        }
        // name
        if ('name' in messageIE) {
            row.push(messageIE['name']);
        } else {
            row.push(null);
        }
        for (let i = depth; i < depthMax; i++) {
            row.push(null);
        }
        // Optional, Conditional, Mandatory
        if ('optional' in messageIE) {
            row.push('O');
        } else if (isChoicable) {
            row.push('C');
        } else {
            row.push('M');
        }
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
        // Custom IE name
        if ('subIE' in messageIE) {
            row.push(messageIE['subIE']);
        } else {
            row.push(null);
        }
        // Actual type
        if ('type' in messageIE) {
            row.push(messageIE['type']);
        } else {
            row.push(null);
        }
        if ('default' in messageIE) {
            row.push(messageIE['default']);
        }
        worksheet_data.push(row);
        if ('content' in messageIE) {
            for (let item of messageIE['content']) {
                preorderHelper(worksheet_data, item, depthMax, depth + 1,
                                isChoicable);
            }
        }
    }
}

function getUniqueMessageIE(messageIEs) {
    let modules = Object.keys(messageIEs);
    switch (modules.length) {
        case 0:
            throw `No message/IE found`;
            break;
        case 1:
            break;
        default:
            throw `Multiple ASN.1 modules have definitions with the same name.
Honestly, I didn't expect this.
Please report an issue with the message/IE name and specification`;
            break;
    }
    return JSON.parse(JSON.stringify(messageIEs[modules[0]]));
}

function integerHelper(messageIE, asn1Json) {
    let ret = '';
    if ('value' in messageIE || 'start' in messageIE) {
        ret += '(';
        if ('value' in messageIE) {
            let value = messageIE['value'];
            if (Number(value) != value) {
                messageIE['constants'][value] = getUniqueMessageIE(parser.getAsn1ByName(value, asn1Json));
            }
            ret += value;
        } else if ('start' in messageIE) {
            let start = messageIE['start'];
            let end = messageIE['end'];
            if (Number(start) != start) {
                messageIE['constants'][start] = getUniqueMessageIE(parser.getAsn1ByName(start, asn1Json));
            }
            if (Number(end) != end) {
                messageIE['constants'][end] = getUniqueMessageIE(parser.getAsn1ByName(end, asn1Json));
            }
            ret += `${start}..${end}`;
        }
        ret += ')';
    }
    return ret;
}

function getSizeExpression(messageIE, asn1Json) {
    let ret = '';
    if ('size' in messageIE || 'sizeMin' in messageIE) {
        ret = '(SIZE(';
        if ('size' in messageIE) {
            let size = messageIE['size'];
            if (Number(size) != size) {
                messageIE['constants'][size] = getUniqueMessageIE(parser.getAsn1ByName(size, asn1Json));
            }
            ret += size;
        } else if ('sizeMin' in messageIE) {
            let sizeMin = messageIE['sizeMin'];
            let sizeMax = messageIE['sizeMax'];
            if (Number(sizeMin) != sizeMin) {
                messageIE['constants'][sizeMin] = getUniqueMessageIE(parser.getAsn1ByName(sizeMin, asn1Json));
            }
            if (Number(sizeMax) != sizeMax) {
                messageIE['constants'][sizeMax] = getUniqueMessageIE(parser.getAsn1ByName(sizeMax, asn1Json));
            }
            ret += `${sizeMin}..${sizeMax}`;
        }
        ret += '))';
    }
    return ret;
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