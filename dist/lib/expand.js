"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let getUniqueMessageIE = require('third-gen-asn1-parser').getUniqueMessageIE;
var builtIns = ['BIT STRING', 'BOOLEAN', 'ENUMERATED', 'INTEGER', 'NULL',
    'OCTET STRING', 'CHOICE', 'SEQUENCE', 'SEQUENCE OF',
    'BIT', 'OCTET' /* HACK */];
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
                if ('containing' in messageIE) {
                    let containedName = messageIE['containing'];
                    delete messageIE['containing'];
                    messageIE['type'] += ` (CONTAINING ${containedName})`;
                    if (!raw) {
                        let containedIE = getUniqueMessageIE(containedName, asn1Json, messageIE['module']);
                        delete containedIE['inventory'];
                        messageIE['content'] = [containedIE];
                        messageIE['content'][0]['name'] = containedName;
                        for (let item of messageIE['content']) {
                            depthMax = Math.max(depthMax, expand(Object.assign(item, { module: messageIE['module'] }), asn1Json, depth + 1, raw));
                            mergeConstants(messageIE, item);
                        }
                    }
                }
                break;
            case 'SEQUENCE OF':
                let memberName = messageIE['member']['type'];
                messageIE['type'] = `SEQUENCE ${getSizeExpression(messageIE, asn1Json)} OF ${messageIE['member']['type']} ${integerHelper(messageIE['member'], asn1Json)}`;
                if ('content' in messageIE['member']) {
                    messageIE['content'] = messageIE['member']['content'];
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(Object.assign(item, { module: messageIE['module'] }), asn1Json, depth + 1, raw));
                        mergeConstants(messageIE, item);
                    }
                }
                delete messageIE['member'];
                delete messageIE['size'];
                delete messageIE['sizeMin'];
                delete messageIE['sizeMax'];
                if (builtIns.indexOf(memberName) == -1 && !raw) {
                    let memberIE = getUniqueMessageIE(memberName, asn1Json, messageIE['module']);
                    delete memberIE['inventory'];
                    messageIE['content'] = [memberIE];
                    messageIE['content'][0]['name'] = memberName;
                    for (let item of messageIE['content']) {
                        depthMax = Math.max(depthMax, expand(Object.assign(item, { module: messageIE['module'] }), asn1Json, depth + 1, raw));
                        mergeConstants(messageIE, item);
                    }
                }
                break;
            case 'CHOICE':
            case 'SEQUENCE':
                for (let item of messageIE['content']) {
                    depthMax = Math.max(depthMax, expand(Object.assign(item, { module: messageIE['module'] }), asn1Json, depth + 1, raw));
                    mergeConstants(messageIE, item);
                }
                break;
            default:
                if (builtIns.indexOf(messageIE['type'].split(' ')[0]) == -1) {
                    if ('parameters' in messageIE) {
                        if (messageIE['parameters'].length) {
                            let newType = `${messageIE['type']} {${messageIE['parameters']
                                .join(', ')}}`;
                            if (raw) {
                                messageIE['type'] = newType;
                            }
                            else {
                                messageIE['subIE'] = newType;
                                let type = getUniqueMessageIE(messageIE['type'], asn1Json, messageIE['module']);
                                substituteArguments(type, type['parameters'], messageIE['parameters']);
                                Object.assign(messageIE, type);
                                depthMax = Math.max(depthMax, expand(messageIE, asn1Json, depth, raw));
                            }
                        }
                        messageIE['parameters'] = [];
                    }
                    else {
                        if (!messageIE['isParameter'] && !raw) {
                            messageIE['subIE'] = messageIE['type'];
                            let type = getUniqueMessageIE(messageIE['type'], asn1Json, messageIE['module']);
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
    }
    else if ('name' in messageIE) {
        // delete messageIE['name'];
    }
    else if ('extensionAdditionGroup' in messageIE) {
        // TODO: This is experimental
        for (let item of messageIE['extensionAdditionGroup']) {
            depthMax = Math.max(depthMax, expand(Object.assign(item, { module: messageIE['module'] }), asn1Json, depth + 2, raw));
        }
    }
    return depthMax;
}
exports.expand = expand;
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
            }
            else {
                substituteArguments(messageIE[i], params, args);
            }
        }
    }
    else {
        for (let key in messageIE) {
            let value = messageIE[key];
            if (typeof value == 'string') {
                let idx = params.indexOf(value);
                if (idx == -1) {
                    continue;
                }
                messageIE[key] = args[idx];
                delete messageIE['isParameter'];
            }
            else {
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
                messageIE['constants'][value] = getUniqueMessageIE(value, asn1Json, messageIE['module']);
            }
            ret += value;
        }
        else if ('start' in messageIE) {
            let start = messageIE['start'];
            let end = messageIE['end'];
            if (Number(start) != start) {
                messageIE['constants'][start] = getUniqueMessageIE(start, asn1Json, messageIE['module']);
            }
            if (Number(end) != end) {
                messageIE['constants'][end] = getUniqueMessageIE(end, asn1Json, messageIE['module']);
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
                messageIE['constants'][size] = getUniqueMessageIE(size, asn1Json, messageIE['module']);
            }
            ret += size;
        }
        else if ('sizeMin' in messageIE) {
            let sizeMin = messageIE['sizeMin'];
            let sizeMax = messageIE['sizeMax'];
            if (Number(sizeMin) != sizeMin) {
                messageIE['constants'][sizeMin] = getUniqueMessageIE(sizeMin, asn1Json, messageIE['module']);
            }
            if (Number(sizeMax) != sizeMax) {
                messageIE['constants'][sizeMax] = getUniqueMessageIE(sizeMax, asn1Json, messageIE['module']);
            }
            ret += `${sizeMin}..${sizeMax}`;
        }
        ret += '))';
    }
    return ret;
}
