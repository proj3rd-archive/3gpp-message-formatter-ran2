var fs = require('fs');
var readline = require('readline');
var xlsx = require('xlsx');
var parser = require('3gpp-asn1-parser');

module.exports = exports = format;

var builtIns = ['BIT STRING', 'BOOLEAN', 'ENUMERATED', 'INTEGER', 'NULL',
                'OCTET STRING', 'CHOICE', 'SEQUENCE', 'SEQUENCE OF',
                'BIT', 'OCTET' /* HACK */];

function format(messageIEname, asn1Json) {
    let messageIE = getUniqueMessageIE(parser.getAsn1ByName(messageIEname,
                                                            asn1Json));
    messageIE['name'] = messageIEname;
    delete messageIE['inventory'];
    let depthMax = expand(messageIE, asn1Json);
    // logJson(messageIE);
    return toWorkbook(messageIEname, messageIE, depthMax);
}

function expand(messageIE, asn1Json, depth = 0) {
    let depthMax = depth;
    if ('type' in messageIE) {
        switch (messageIE['type']) {
            case 'BOOLEAN':
            case 'NULL':
                break;
            case 'BIT STRING':
                messageIE['type'] += ` ${getSizeExpression(messageIE)}`;
                delete messageIE['size'];
                delete messageIE['sizeMin'];
                delete messageIE['sizeMax'];
                break;
            case 'ENUMERATED':
                messageIE['type'] += ` {${messageIE['content'].join(', ')}}`;
                delete messageIE['content'];
                break;
            case 'INTEGER':
                messageIE['type'] += ` ${integerHelper(messageIE)}`;
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
                    }
                }
                break;
            case 'SEQUENCE OF':
                let memberName = messageIE['member']['type'];
                messageIE['type'] = `SEQUENCE ${getSizeExpression(messageIE)} OF ${messageIE['member']['type']} ${integerHelper(messageIE['member'])}`;
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
                    }
                }
                break;
            case 'CHOICE':
            case 'SEQUENCE':
                for (let item of messageIE['content'] ) {
                    depthMax = Math.max(depthMax, expand(item, asn1Json, depth + 1));
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

function toWorkbook(messageIEname, messageIE, depthMax) {
    let workbook = xlsx.utils.book_new();
    let worksheet_data = [];
    let header = [];
    header.push('IE');
    for (let i = 0; i < depthMax; i++) {
        header.push(null);
    }
    header.push('M/O/C', 'Need code/Condition', 'Sub IE', 'Type/Description', 'DEFAULT');
    worksheet_data.push(header);
    preorderHelper(worksheet_data, messageIE, depthMax);
    let worksheet = xlsx.utils.aoa_to_sheet(worksheet_data);
    let sheetname = messageIEname.substring(0, 30);
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetname);
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

function integerHelper(asn1Json) {
    let ret = '';
    if ('value' in asn1Json || 'start' in asn1Json) {
        ret += '(';
        if ('value' in asn1Json) {
            ret += asn1Json['value'];
        } else if ('start' in asn1Json) {
            ret += `${asn1Json['start']}..${asn1Json['end']}`;
        }
        ret += ')';
    }
    return ret;
}

function getSizeExpression(asn1Json) {
    let ret = '';
    if ('size' in asn1Json || 'sizeMin' in asn1Json) {
        ret = '(SIZE(';
        if ('size' in asn1Json) {
            ret += asn1Json['size'];
        } else if ('sizeMin' in asn1Json) {
            ret += `${asn1Json['sizeMin']}..${asn1Json['sizeMax']}`;
        }
        ret += '))';
    }
    return ret;
}

if (require.main == module) {
    if (process.argv.length >= 4) {
        let input = fs.readFileSync(process.argv[2], 'utf8');
        let messageIEname = process.argv[3];
        let asn1Json = parser.parse(input);
        xlsx.writeFile(format(messageIEname, asn1Json), `${messageIEname}.xlsx`);
    } else {
        console.log('Usage: node formatter <file_name> <message/IE>');
        console.log('  ex : node formatter 38331-f10.asn1 RRCReconfiguration');
    } 
}

function logJson(json) {
    console.log(JSON.stringify(json, null, 2));
}