var fs = require('fs');
var path = require('path');
var ArgumentParser = require('argparse').ArgumentParser;
var extract = require('third-gen-asn1-extractor');
var parser = require('third-gen-asn1-parser');
var getUniqueMessageIE = parser.getUniqueMessageIE;
var xlsx = require('@gsongsong/xlsx');
var libExpand = require('./lib/expand');
var libFormatXlsx = require('./lib/formatXlsx');
var libFormatTxt = require('./lib/formatTxt');

var expand = libExpand.expand;
var expandAll = libExpand.expandAll;
var toWorksheet = libFormatXlsx.toWorksheet;
var toWorkbook = libFormatXlsx.toWorkbook;
var formatTxt = libFormatTxt.formatTxt;

exports.expand = expand;
exports.expandAll =  expandAll;
exports.toWorksheet = toWorksheet;
exports.toWorkbook = toWorkbook;
exports.format = format;
exports.formatAll = formatAll;

function format(messageIEname, asn1Json, raw = false, format = 'xlsx') {
    if (messageIEname == '__all') {
        if (format == 'xlsx') {
            let messageIEs = expandAll(asn1Json, raw);
            let worksheets = [];
            let styles = [];
            formatAll(messageIEs, worksheets, styles);
            return toWorkbook(worksheets, styles);
        } else if (format == 'txt') {
            // TODO later...
        }
    } else {
        let messageIE = getUniqueMessageIE(messageIEname, asn1Json);
        messageIEHelper(messageIE, messageIEname);
        console.log(`Formatting ${messageIE['module']}/${messageIEname}...`);
        let depthMax = expand(messageIE, asn1Json, 0, raw);
        if (format == 'xlsx') {
            let worksheets = [];
            let styles = [];
            let worksheetWithStyle = toWorksheet(messageIEname, messageIE, depthMax);
            worksheets.push(worksheetWithStyle['worksheet']);
            styles.push(worksheetWithStyle['style']);
            return toWorkbook(worksheets, styles);
        } else if (format == 'txt') {
            return formatTxt(messageIEname, messageIE);
        }
    }
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
    argParser.addArgument(['-r', '--raw'], {help: 'Do not expand sub IEs. txt output format forces raw',
                                            action: 'storeTrue'});
    argParser.addArgument(['-f', '--format'], {defaultValue: 'xlsx',
                                            help: 'Output format. [xlsx]/txt'});
    let args = {};
    try {
        args = argParser.parseArgs();
    } catch (e) {
        argParser.printHelp();
        process.exit();
    }
    // force raw
    if (args.format == 'txt') {
        args.raw = true;
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
    outputFile += `.${args.format}`;
    let formatted = format(messageIEname, asn1Json, args.raw, args.format);
    if (args.format == 'xlsx') {
        xlsx.writeFile(formatted, outputFile);
    } else if (args.format == 'txt') {
        fs.writeFileSync(outputFile, formatted);
    }
}

function logJson(json) {
    console.log(JSON.stringify(json, null, 2));
}