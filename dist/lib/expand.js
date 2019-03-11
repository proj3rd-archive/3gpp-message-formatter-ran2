"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let getUniqueMessageIE = require('third-gen-asn1-parser').getUniqueMessageIE;
var builtIns = ['BIT STRING', 'BOOLEAN', 'ENUMERATED', 'INTEGER', 'NULL',
    'OCTET STRING', 'CHOICE', 'SEQUENCE', 'SEQUENCE OF',
    'BIT', 'OCTET' /* HACK */];
function expand(ieInitial, asn1Json, depthInitial = 0, raw = false) {
    let queue = [{
            ie: ieInitial,
            depth: depthInitial,
        }];
    if (!('constants' in ieInitial)) {
        ieInitial['constants'] = {};
    }
    let depthMax = depthInitial;
    while (queue.length) {
        let { ie, depth } = queue.shift();
        depthMax = Math.max(depthMax, depth);
        if ('type' in ie) {
            switch (ie['type']) {
                case 'BOOLEAN':
                case 'NULL':
                    break;
                case 'BIT STRING':
                    ie['type'] += ` ${getSizeExpression(ie, asn1Json)}`;
                    delete ie['size'];
                    delete ie['sizeMin'];
                    delete ie['sizeMax'];
                    break;
                case 'ENUMERATED':
                    ie['type'] += ` {${ie['content'].join(', ')}}`;
                    delete ie['content'];
                    break;
                case 'INTEGER':
                    ie['type'] += ` ${integerHelper(ie, asn1Json)}`;
                    delete ie['value'];
                    delete ie['start'];
                    delete ie['end'];
                    break;
                case 'OCTET STRING':
                    if ('containing' in ie) {
                        let containedName = ie['containing'];
                        delete ie['containing'];
                        ie['type'] += ` (CONTAINING ${containedName})`;
                        if (!raw) {
                            let containedIE = getUniqueMessageIE(containedName, asn1Json, ie['module']);
                            delete containedIE['inventory'];
                            ie['content'] = [containedIE];
                            ie['content'][0]['name'] = containedName;
                            for (let item of ie['content']) {
                                queue.push({
                                    ie: Object.assign(item, { module: ie['module'] }),
                                    depth: depth + 1,
                                });
                            }
                        }
                    }
                    break;
                case 'SEQUENCE OF':
                    let memberName = ie['member']['type'];
                    ie['type'] = `SEQUENCE ${getSizeExpression(ie, asn1Json)} OF ${ie['member']['type']} ${integerHelper(ie['member'], asn1Json)}`;
                    if ('content' in ie['member']) {
                        ie['content'] = ie['member']['content'];
                        for (let item of ie['content']) {
                            queue.push({
                                ie: Object.assign(item, { module: ie['module'] }),
                                depth: depth + 1
                            });
                        }
                    }
                    delete ie['member'];
                    delete ie['size'];
                    delete ie['sizeMin'];
                    delete ie['sizeMax'];
                    if (builtIns.indexOf(memberName) == -1 && !raw) {
                        let memberIE = getUniqueMessageIE(memberName, asn1Json, ie['module']);
                        delete memberIE['inventory'];
                        ie['content'] = [memberIE];
                        ie['content'][0]['name'] = memberName;
                        for (let item of ie['content']) {
                            queue.push({
                                ie: Object.assign(item, { module: ie['module'] }),
                                depth: depth + 1
                            });
                        }
                    }
                    break;
                case 'CHOICE':
                case 'SEQUENCE':
                    for (let item of ie['content']) {
                        queue.push({
                            ie: Object.assign(item, { module: ie['module'] }),
                            depth: depth + 1
                        });
                    }
                    break;
                default:
                    if (builtIns.indexOf(ie['type'].split(' ')[0]) == -1) {
                        if ('parameters' in ie) {
                            if (ie['parameters'].length) {
                                let newType = `${ie['type']} {${ie['parameters']
                                    .join(', ')}}`;
                                if (raw) {
                                    ie['type'] = newType;
                                }
                                else {
                                    ie['subIE'] = newType;
                                    let type = getUniqueMessageIE(ie['type'], asn1Json, ie['module']);
                                    substituteArguments(type, type['parameters'], ie['parameters']);
                                    Object.assign(ie, type);
                                    queue.push({
                                        ie: ie,
                                        depth: depth
                                    });
                                }
                            }
                            ie['parameters'] = [];
                        }
                        else {
                            if (!ie['isParameter'] && !raw) {
                                ie['subIE'] = ie['type'];
                                let type = getUniqueMessageIE(ie['type'], asn1Json, ie['module']);
                                delete type['inventory'];
                                Object.assign(ie, type);
                                if ('content' in ie) {
                                    // ie['content'][0]['name'] = ie['subIE'];
                                }
                                queue.push({
                                    ie: ie,
                                    depth: depth
                                });
                            }
                        }
                    }
                    break;
            }
        }
        else if ('name' in ie) {
            // delete messageIE['name'];
        }
        else if ('extensionAdditionGroup' in ie) {
            // TODO: This is experimental
            for (let item of ie['extensionAdditionGroup']) {
                queue.push({
                    ie: Object.assign(item, { module: ie['module'] }),
                    depth: depth + 2
                });
            }
        }
        if (ie !== ieInitial) {
            mergeConstants(ieInitial, ie);
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
