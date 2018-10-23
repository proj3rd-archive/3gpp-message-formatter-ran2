exports.formatTxt = formatTxt;

function formatTxt(messageIEname, messageIE) {
    let outputArr = [`${messageIEname} ::= `];
    preorderHelper(outputArr, messageIE);
    // if (Object.keys(messageIE['constants']).length) {
    //     worksheet_data.push([null]);
    //     worksheet_data.push(['Constants']);
    //     for (let key in messageIE['constants']) {
    //         let row = [key, messageIE['constants'][key]['value']];
    //         for (let i = 0; i < depthMax; i++) {
    //             row.splice(1, 0, null);
    //         }
    //         worksheet_data.push(row);
    //     }
    // }
    return outputArr.join('');
}

function preorderHelper(outputArr, messageIE, depth = 0, itemFollows) {
    if (Object.keys(messageIE).length == 1 && 'module' in messageIE) {
        return;
    }
    if ('extensionAdditionGroup' in messageIE) {
        outputArr.push(`${' '.repeat(4 * depth)}[[\n`);
        for (let i = 0; i < messageIE['extensionAdditionGroup'].length; i++) {
            let item = messageIE['extensionAdditionGroup'][i];
            let itemFollows = false;
            if (i != messageIE['extensionAdditionGroup'].length - 1) {
                itemFollows = true;
            }
            preorderHelper(outputArr, item, depth, itemFollows);
            outputArr.push('\n');
        }
        outputArr.push(`${' '.repeat(4 * depth)}]]`);
        if (itemFollows) {
            outputArr.push(',');
        }
    } else {
        // name
        if ('name' in messageIE && depth) {
            outputArr.push(`${' '.repeat(4 * depth)}${messageIE['name']}`);
        }
        if ('type' in messageIE) {
            // Actual type
            outputArr.push(`    ${messageIE['type']}`);
        } else if ('subIE' in messageIE) {
            // Custom IE name
            outputArr.push(`    ${messageIE['subIE']}`);
        }
        outputArr.push(outputArr);
        if ('content' in messageIE) {
            if (!messageIE['content'].length) {
                outputArr.push(' {}');
            } else {
                outputArr.push(' {\n');
                for (let i = 0; i < messageIE['content'].length; i++) {
                    let item = messageIE['content'][i];
                    let itemFollows = false;
                    if (i != messageIE['content'].length - 1) {
                        itemFollows = true;
                    }
                    preorderHelper(outputArr, item, depth + 1, itemFollows);
                    outputArr.push('\n');
                }
                outputArr.push(`${' '.repeat(4 * depth)}}`);
            }
        }
        if ('optional' in messageIE) {
            outputArr.push('    OPTIONAL');
        }
        if ('default' in messageIE) {
            outputArr.push(`    DEFAULT ${messageIE['default']}`);
        }
        if (itemFollows) {
            outputArr.push(',');
        }
        // Need code, condition
        if ('needCode' in messageIE) {
            outputArr.push(`    ${messageIE['needCode']}`);
        } else if ('condition' in messageIE) {
            outputArr.push(`    -- Cond ${messageIE['condition']}`);
        }
    }
}
