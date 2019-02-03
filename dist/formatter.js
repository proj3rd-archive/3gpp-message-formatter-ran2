"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require('fs');
var path = require('path');
var ArgumentParser = require('argparse').ArgumentParser;
var extract = require('third-gen-asn1-extractor');
var parser = require('third-gen-asn1-parser');
var getUniqueMessageIE = parser.getUniqueMessageIE;
var libExpand = require('./lib/expand');
var libFormatXlsx = require('./lib/formatXlsx');
var libFormatTxt = require('./lib/formatTxt');
var expand = libExpand.expand;
var toWorkbook = libFormatXlsx.toWorkbook;
var formatTxt = libFormatTxt.formatTxt;
function format(messageIEname, asn1Json, raw = false, format = 'xlsx') {
    let messageIE = getUniqueMessageIE(messageIEname, asn1Json);
    messageIEHelper(messageIE, messageIEname);
    console.log(`Formatting ${messageIE['module']}/${messageIEname}...`);
    let depthMax = expand(messageIE, asn1Json, 0, raw);
    if (format == 'xlsx') {
        return toWorkbook(messageIEname, messageIE, depthMax);
    }
    else if (format == 'txt') {
        return formatTxt(messageIEname, messageIE);
    }
}
exports.format = format;
function messageIEHelper(messageIE, messageIEname) {
    messageIE['name'] = messageIEname;
    delete messageIE['inventory'];
}
if (require.main == module) {
    let argParser = new ArgumentParser({ addHelp: true, debug: true });
    argParser.addArgument('specFile', { help: 'Sepcification file name' });
    argParser.addArgument('messageIEname', { help: 'Message or IE name' });
    argParser.addArgument(['-r', '--raw'], { help: 'Do not expand sub IEs. txt output format forces raw',
        action: 'storeTrue' });
    argParser.addArgument(['-f', '--format'], { defaultValue: 'xlsx',
        help: 'Output format. [xlsx]/txt' });
    let args = {};
    try {
        args = argParser.parseArgs();
    }
    catch (e) {
        argParser.printHelp();
        process.exit();
    }
    // force raw
    if (args.format == 'txt') {
        args.raw = true;
    }
    let inputFile = path.parse(args.specFile);
    let input = extract(fs.readFileSync(path.resolve(process.cwd(), inputFile['dir'], inputFile['base']), 'utf8'));
    let messageIEname = args.messageIEname;
    let asn1Json = parser.parse(input);
    let outputFile = `${messageIEname}-${inputFile['name']}`;
    if (args.raw) {
        outputFile += '-raw';
    }
    outputFile += `.${args.format}`;
    let formatted = format(messageIEname, asn1Json, args.raw, args.format);
    if (args.format == 'xlsx') {
        formatted.write(outputFile);
    }
    else if (args.format == 'txt') {
        fs.writeFileSync(outputFile, formatted);
    }
}
function logJson(json) {
    console.log(JSON.stringify(json, null, 2));
}
