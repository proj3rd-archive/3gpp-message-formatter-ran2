var fs = require('fs');
var path = require('path');
var ArgumentParser = require('argparse').ArgumentParser;
var readline = require('readline-sync');
var xlsx = require('@gsongsong/xlsx');
var addr = xlsx.utils.encode_cell;
var cell = xlsx.utils.decode_cell;
var extract = require('third-gen-asn1-extractor');
var parser = require('third-gen-asn1-parser');

exports.expand = expand;
exports.expandAll =  expandAll;
exports.toWorksheet = toWorksheet;
exports.toWorkbook = toWorkbook;
exports.format = format;
exports.formatAll = formatAll;

var builtIns = ['BIT STRING', 'BOOLEAN', 'ENUMERATED', 'INTEGER', 'NULL',
                'OCTET STRING', 'CHOICE', 'SEQUENCE', 'SEQUENCE OF',
                'BIT', 'OCTET' /* HACK */];

function format(messageIEname, asn1Json, raw = false) {
    let worksheets = [];
    let styles = [];
    if (messageIEname == '__all') {
        let messageIEs = expandAll(asn1Json, raw);
        formatAll(messageIEs, worksheets, styles);
    } else {
        let messageIE = getUniqueMessageIE(messageIEname, asn1Json);
        messageIEHelper(messageIE, messageIEname);
        console.log(`Formatting ${messageIE['module']}/${messageIEname}...`);
        let depthMax = expand(messageIE, asn1Json, 0, raw);
        let worksheetWithStyle = toWorksheet(messageIEname, messageIE, depthMax);
        worksheets.push(worksheetWithStyle['worksheet']);
        styles.push(worksheetWithStyle['style']);
    }
    return toWorkbook(worksheets, styles);
}

function formatAll(messageIEs, worksheets, styles) {
    let idx = 0;
    for (let moduleName in messageIEs) {
        for (let definition in messageIEs[moduleName]) {
            let messageIE = messageIEs[moduleName][definition];
            let depthMax = messageIE['depthMax'];
            let idxString = String(idx);
            let worksheetWithStyle = toWorksheet(
                `${definition.substring(0, 30 - (idxString.length + 1))} ${idxString}`,
                messageIE, depthMax);
            worksheets.push(worksheetWithStyle['worksheet']);
            styles.push(worksheetWithStyle['style']);
            idx++;
        }
    }
}

function messageIEHelper(messageIE, messageIEname) {
    messageIE['name'] = messageIEname;
    delete messageIE['inventory'];
}

function expandAll(asn1Json, raw = false) {
    let messageIEs = {};
    for (let moduleName in asn1Json) {
        messageIEs[moduleName] = {};
        for (let definition in asn1Json[moduleName]) {
            if (definition == 'import') {
                continue;
            }
            let messageIE = Object.assign(JSON.parse(JSON.stringify(
                                        asn1Json[moduleName][definition])),
                                        {module: moduleName});
            messageIEHelper(messageIE, definition);
            if (messageIE['type'] == 'INTEGER') {
                continue;
            }
            console.log(`Formatting ${moduleName}/${definition}...`);
            let depthMax = expand(messageIE, asn1Json, 0, raw);
            messageIE['depthMax'] = depthMax;
            messageIEs[moduleName][definition] = messageIE;
        }
    }
    return messageIEs;
}

function expand(messageIE, asn1Json, depth = 0, raw = false) {
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
                if ('containing' in messageIE && !raw) {
                    let containedName = messageIE['containing'];
                    delete messageIE['containing'];
                    messageIE['type'] += ` (CONTAINING ${containedName})`;
                    let containedIE = getUniqueMessageIE(containedName,
                                                asn1Json, messageIE['module']);
                    delete containedIE['inventory'];
                    messageIE['content'] = [containedIE];
                    messageIE['content'][0]['name'] = containedName;
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(Object.assign(item, {module: messageIE['module']}), asn1Json, depth + 1, raw));
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
                if (!builtIns.includes(memberName) && !raw) {
                    let memberIE = getUniqueMessageIE(memberName, asn1Json,
                                                      messageIE['module']);
                    delete memberIE['inventory'];
                    messageIE['content'] = [memberIE];
                    messageIE['content'][0]['name'] = memberName;
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(Object.assign(item, {module: messageIE['module']}), asn1Json, depth + 1, raw));
                        mergeConstants(messageIE, item);
                    }
                }
                break;
            case 'CHOICE':
            case 'SEQUENCE':
                for (let item of messageIE['content'] ) {
                    depthMax = Math.max(depthMax, expand(Object.assign(item, {module: messageIE['module']}), asn1Json, depth + 1, raw));
                    mergeConstants(messageIE, item);
                }
                break;
            default:
                if (!builtIns.includes(messageIE['type'].split(' ')[0])) {
                    if ('parameters' in messageIE) {
                        if (messageIE['parameters'].length && !raw) {
                            let type = getUniqueMessageIE(messageIE['type'],
                                                asn1Json, messageIE['module']);
                            substituteArguments(type, type['parameters'], messageIE['parameters']);
                            messageIE['subIE'] = `${messageIE['type']} {${messageIE['parameters']
                                                                .join(', ')}}`;
                            Object.assign(messageIE, type);
                            depthMax = Math.max(depthMax, expand(messageIE, asn1Json, depth, raw));
                        }
                        messageIE['parameters'] = [];
                    } else {
                        if (!messageIE['isParameter'] && !raw) {
                            messageIE['subIE'] = messageIE['type'];
                            let type = getUniqueMessageIE(messageIE['type'],
                                                asn1Json, messageIE['module']);
                            delete type['inventory'];
                            Object.assign(messageIE, type);
                            if ('content' in messageIE) {
                                // messageIE['content'][0]['name'] = messageIE['subIE'];
                            }
                            depthMax = Math.max(depthMax, expand(messageIE, asn1Json, depth, raw));
                        }
                    }
                }
                if ('content' in messageIE) {
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(item, asn1Json, depth + 1, raw));
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
            depthMax = Math.max(depthMax, expand(Object.assign(item, {module: messageIE['module']}), asn1Json, depth, raw));
        }
    }
    return depthMax;
}

function substituteArguments(messageIE, params, args) {
    delete messageIE['parameters'];
    delete messageIE['parameterisedType'];
    if (messageIE instanceof Array) {
        for (let i = 0; i < messageIE.length; i++) {
            let elem = messageIE[i];
            if (typeof elem == 'string') {
                let idx = params.indexOf(elem);
                if (idx == -1) {
                    continue;
                }
                messageIE[i] = args[idx];
            } else {
                substituteArguments(messageIE[i], params, args);
            }
        }
    } else {
        for (let key in messageIE) {
            let value = messageIE[key];
            if (typeof value == 'string') {
                let idx = params.indexOf(value);
                if (idx == -1) {
                    continue;
                }
                messageIE[key] = args[idx];
                delete messageIE['isParameter'];
            } else {
                substituteArguments(messageIE[key], params, args);
            }
        }
    }
}

function mergeConstants(parentIE, childIE) {
    for (let key in childIE['constants']) {
        parentIE['constants'][key] = childIE['constants'][key];
    }
    delete childIE['constants'];
}

var fillWhite = {patternType: 'solid', fgColor: {rgb: 'FFFFFFFF'}}
var borderTop = {top: {style: 'thin'}};
var borderLeft = {left: {style: 'thin'}};
var borderTopLeft = {top: {style: 'thin'}, left: {style: 'thin'}};

function toWorksheet(sheetname, messageIE, depthMax) {
    let worksheet_data = [];
    let styles = {};
    let rowNum = 0;
    let header = [];
    header.push('IE');
    styles[addr({c: 0, r: rowNum})] = {fill: fillWhite, border: borderTopLeft};
    for (let i = 0; i < depthMax; i++) {
        header.push(null);
        styles[addr({c: i + 1, r: rowNum})] = {fill: fillWhite, border: borderTop};
    }
    header.push('M/O/C', 'Need code/Condition', 'Sub IE', 'Type/Description', 'DEFAULT');
    for (let i = 0; i < header.length; i++) {
        styles[addr({c: i + depthMax, r: rowNum})] = {fill: fillWhite, border: borderTop};
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
    }
    sheetname = sheetname.substring(0, 30);
    return {worksheet: {sheetname: sheetname, worksheet: worksheet},
            style: styles};
}

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

function preorderHelper(worksheet_data, messageIE, styles, rowNum, depthMax,
                        depth = 0, isChoicable = false) {
    if (Object.keys(messageIE).length == 1 && 'module' in messageIE) {
        return rowNum;
    }
    if ('extensionAdditionGroup' in messageIE) {
        worksheet_data.push(['[[']);
        styles[addr({c: 0, r: rowNum})] = {fill: fillWhite, border: borderTopLeft};
        rowNum++;
        for (let item of messageIE['extensionAdditionGroup']) {
            rowNum = preorderHelper(worksheet_data, item, styles, rowNum,
                                    depthMax, depth, isChoicable);
        }
        worksheet_data.push([']]']);
        styles[addr({c: 0, r: rowNum})] = {fill: fillWhite, border: borderTopLeft};
        rowNum++;
    } else {
        let row = [];
        let k = 0;
        for (let i = 0; i < depth; i++) {
            row.push(null);
            styles[addr({c: i, r: rowNum})] = {fill: fillWhite, border: borderLeft};
            k = i;
        }
        if (depth) k++;
        // name
        if ('name' in messageIE) {
            row.push(messageIE['name']);
            styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTopLeft};
        } else {
            row.push(null);
            styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderLeft};
        }
        k++;
        for (let i = depth; i < depthMax; i++) {
            row.push(null);
            styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTop};
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
        styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTop};
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
        styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTop};
        k++;
        // Custom IE name
        if ('subIE' in messageIE) {
            row.push(messageIE['subIE']);
        } else {
            row.push(null);
        }
        styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTop};
        k++;
        // Actual type
        if ('type' in messageIE) {
            row.push(messageIE['type']);
        } else {
            row.push(null);
        }
        styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTop};
        k++;
        if ('default' in messageIE) {
            row.push(messageIE['default']);
        }
        styles[addr({c: k, r: rowNum})] = {fill: fillWhite, border: borderTop};
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

function getUniqueMessageIE(messageIEname, asn1Json, moduleName) {
    if (moduleName) {
        // 1. Search in the current module
        if (moduleName in asn1Json && 
            Object.keys(asn1Json[moduleName]).includes(messageIEname)) {
                return Object.assign(JSON.parse(JSON.stringify(
                                        asn1Json[moduleName][messageIEname])),
                                     {module: moduleName, constants: {}});
        }
        // 2. Search in moduleName's import (list of list)
        for (let importedModuleName in asn1Json[moduleName].import) {
            let importedModule = asn1Json[moduleName]['import'][importedModuleName];
            if (importedModule.includes(messageIEname)) {
                return Object.assign(
                            JSON.parse(JSON.stringify(
                                asn1Json[importedModuleName][messageIEname])),
                            {module: importedModuleName, constants: {}});
            }
        }
    }
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
                         {module: modules[idx], constants: {}});
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
                                                asn1Json, messageIE['module']);
            }
            ret += value;
        } else if ('start' in messageIE) {
            let start = messageIE['start'];
            let end = messageIE['end'];
            if (Number(start) != start) {
                messageIE['constants'][start] = getUniqueMessageIE(start,
                                                asn1Json, messageIE['module']);
            }
            if (Number(end) != end) {
                messageIE['constants'][end] = getUniqueMessageIE(end,
                                                asn1Json, messageIE['module']);
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
                                                asn1Json, messageIE['module']);
            }
            ret += size;
        } else if ('sizeMin' in messageIE) {
            let sizeMin = messageIE['sizeMin'];
            let sizeMax = messageIE['sizeMax'];
            if (Number(sizeMin) != sizeMin) {
                messageIE['constants'][sizeMin] = getUniqueMessageIE(sizeMin,
                                                asn1Json, messageIE['module']);
            }
            if (Number(sizeMax) != sizeMax) {
                messageIE['constants'][sizeMax] = getUniqueMessageIE(sizeMax,
                                                asn1Json, messageIE['module']);
            }
            ret += `${sizeMin}..${sizeMax}`;
        }
        ret += '))';
    }
    return ret;
}

if (require.main == module) {
    let argParser = new ArgumentParser({addHelp: true, debug: true});
    argParser.addArgument('specFile', {help: 'Sepcification file name'});
    argParser.addArgument('messageIEname', {help: 'Message or IE name'});
    argParser.addArgument(['-r', '--raw'], {help: 'Do not expand sub IEs',
                                            action: 'storeTrue'});
    let args = {};
    try {
        args = argParser.parseArgs();
    } catch (e) {
        argParser.printHelp();
        process.exit();
    }
    let inputFile = path.parse(args.specFile);
    let input = extract(fs.readFileSync(path.resolve(process.cwd(),
                                                        inputFile['dir'],
                                                        inputFile['base']),
                                        'utf8'));
    let messageIEname = args.messageIEname;
    let asn1Json = parser.parse(input);
    let outputFile;
    if (messageIEname == '__all') {
        outputFile = inputFile['name'];
    } else {
        outputFile = `${messageIEname}-${inputFile['name']}`;
    }
    if (args.raw) {
        outputFile += '-raw';
    }
    outputFile += '.xlsx';
    xlsx.writeFile(format(messageIEname, asn1Json, args.raw), outputFile);
}

function logJson(json) {
    console.log(JSON.stringify(json, null, 2));
}