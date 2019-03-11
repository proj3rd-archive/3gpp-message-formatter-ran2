var xlsx = require('excel4node');

interface IQueueItem {
    ie: any,
    depth: number,
    isChoicable: boolean
}

var fillWhite = {
    type: 'pattern',
    patternType: 'solid',
    fgColor: 'FFFFFF'
}
var borderTop = { top: { style: 'thin' } };
var borderLeft = { left: { style: 'thin' } };
var borderTopLeft = { top: { style: 'thin' }, left: { style: 'thin' } };
var borderAll = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
};

export function toWorkbook(messageIEname: string, messageIE: any, depthMax: number) {
    let workbook = new xlsx.Workbook();
    let sheetname = messageIEname.substring(0, 30);
    let worksheet = workbook.addWorksheet(sheetname, {
        outline: {
            summaryBelow: false
        }
    });
    fillWorksheet(worksheet, messageIE, depthMax);
    return workbook;
}

export function fillWorksheet(ws: any, messageIE: any, depthMax: number) {
    for (let i = 0; i < depthMax; i++) {
        ws.column(i + 1).setWidth(3);
    }
    ws.column(depthMax + 1).setWidth(30);

    let rowNum = 1;
    ws.cell(rowNum, 1).string('IE').style({
        fill: fillWhite,
        border: borderTopLeft
    });
    ws.cell(rowNum, 2, rowNum, depthMax + 1).style({
        fill: fillWhite,
        border: borderTop
    });
    ws.cell(rowNum, depthMax + 2).string('M/O/C');
    ws.cell(rowNum, depthMax + 3).string('Need code/Condition');
    ws.cell(rowNum, depthMax + 4).string('Sub IE');
    ws.cell(rowNum, depthMax + 5).string('Type/Description');
    ws.cell(rowNum, depthMax + 6).string('DEFAULT');
    ws.cell(rowNum, depthMax + 2, rowNum, depthMax + 6).style({
        fill: fillWhite,
        border: borderTop
    });
    rowNum = preorderHelper(ws, messageIE, ++rowNum, depthMax);
    if (Object.keys(messageIE['constants']).length) {
        rowNum++;
        ws.cell(rowNum, 1, rowNum, depthMax + 2, true).string('Constants').style({
            fill: fillWhite,
            border: borderAll
        });
        for (let key in messageIE['constants']) {
            rowNum++;
            ws.cell(rowNum, 1, rowNum, depthMax + 1, true).string(key).style({
                fill: fillWhite,
                border: borderAll
            });
            ws.cell(rowNum, depthMax + 2).number(messageIE['constants'][key]['value']).style({
                fill: fillWhite,
                border: borderAll
            });
        }
    }
}

function preorderHelper(ws: any, ieInitial: any, rowNumInitial: number,
                        depthMax: number, depthInitial = 0, isChoicable = false) {
    let rowNum = rowNumInitial;
    let queue: IQueueItem[] = [{
        ie: ieInitial,
        depth: depthInitial,
        isChoicable: isChoicable
    }];
    while (queue.length) {
        let {ie, depth, isChoicable} = queue.shift()
        if (Object.keys(ie).length == 1 && 'module' in ie) {
            return rowNum;
        }
        if ('extensionAdditionGroup' in ie) {
            let rowGroupSummary = rowNum;
            let queueTemp: IQueueItem[] = [];
            queueTemp.push({
                ie: {
                    name: '[['
                },
                depth: depth,
                isChoicable: isChoicable
            });
            for (let item of ie['extensionAdditionGroup']) {
                queueTemp.push({
                    ie: item,
                    depth: depth + 1,
                    isChoicable: isChoicable
                });
            }
            queueTemp.push({
                ie: {
                    name: ']]'
                },
                depth: depth,
                isChoicable: isChoicable
            });
            queue = queueTemp.concat(queue);
            continue;
        } else {
            let k = depth ? depth + 1 : 1;
            // name
            if ('name' in ie) {
                if (ie['name'] == '...') {
                    continue;
                }
                ws.cell(rowNum, k++).string(ie['name']).style({
                    fill: fillWhite,
                    border: borderTopLeft
                });
            } else {
                ws.cell(rowNum, k++).style({
                    fill: fillWhite,
                    border: borderLeft
                });
            }
            ws.cell(rowNum, 1, rowNum, depth + 1).style({
                fill: fillWhite,
                border: borderLeft
            });
            ws.cell(rowNum, k, rowNum, k + (depthMax - depth)).style({
                fill: fillWhite,
                border: borderTop
            });
            k = depthMax + 2;
            // Optional, Conditional, Mandatory
            let MOC = '';
            if ('optional' in ie) {
                MOC = 'O'
            } else if (isChoicable) {
                MOC = 'C';
            } else if (ie.name != '[[' && ie.name != ']]') {
                MOC = 'M';
            }
            ws.cell(rowNum, k++).string(MOC).style({
                fill: fillWhite,
                border: borderTop
            });
            // Choice
            isChoicable = false;
            if (ie.type && ie['type'].includes('CHOICE')) {
                isChoicable = true;
            }
            // Need code, condition
            let needCode = '';
            if ('needCode' in ie) {
                needCode = ie['needCode'].substring(3);
            } else if ('condition' in ie) {
                needCode = `Cond ${ie['condition']}`;
            }
            ws.cell(rowNum, k++).string(needCode).style({
                fill: fillWhite,
                border: borderTop
            });
            // Custom IE name
            let subIe = '';
            if ('subIE' in ie) {
                subIe = ie['subIE'];
            }
            ws.cell(rowNum, k++).string(subIe).style({
                fill: fillWhite,
                border: borderTop
            });
            // Actual type
            let type = '';
            if ('type' in ie) {
                type = ie['type'];
            }
            ws.cell(rowNum, k++).string(type).style({
                fill: fillWhite,
                border: borderTop
            });
            let defaultValue = '';
            if ('default' in ie) {
                defaultValue = `${ie['default']}`;
            }
            ws.cell(rowNum, k++).string(defaultValue).style({
                fill: fillWhite,
                border: borderTop
            });
            let rowGroupSummary = rowNum++;
            if ('content' in ie) {
                let queueTemp: IQueueItem[] = [];
                for (let item of ie['content']) {
                    queueTemp.push({
                        ie: item,
                        depth: depth + 1,
                        isChoicable: isChoicable
                    });
                }
                queue = queueTemp.concat(queue);
                // FIXME
                if (depth >= 1 && depth <= 7 && rowNum > rowGroupSummary + 1) {
                    for (let i = rowGroupSummary + 1; i < rowNum; i++) {
                        if (ws.row(i).outlineLevel === null) {
                            ws.row(i).group(depth);
                        }
                    }
                }
            }
            continue;
        }
    }
    return rowNum;
}
