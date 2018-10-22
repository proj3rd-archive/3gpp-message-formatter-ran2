var fs = require('fs');
var path = require('path');
var ArgumentParser = require('argparse').ArgumentParser;
var extract = require('third-gen-asn1-extractor');
var parser = require('third-gen-asn1-parser');
var getUniqueMessageIE = parser.getUniqueMessageIE;
var xlsx = require('@gsongsong/xlsx');
var libExpand = require('./lib/expand');
var libFormatXlsx = require('./lib/formatXlsx');

exports.expand = expand = libExpand.expand;
exports.expandAll =  expandAll = libExpand.expandAll;
exports.toWorksheet = toWorksheet = libFormatXlsx.toWorksheet;
exports.toWorkbook = toWorkbook = libFormatXlsx.toWorkbook;
exports.format = format;
exports.formatAll = formatAll;

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