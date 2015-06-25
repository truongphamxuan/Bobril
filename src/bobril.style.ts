/// <reference path="bobril.d.ts"/>
/// <reference path="bobril.style.d.ts"/>

interface ISprite {
    styleid: IBobrilStyleDef;
    url: string;
    width: number;
    height: number;
    left: number;
    top: number;
}

interface IInternalStyle {
    name: string;
    parent?: IBobrilStyleDef|IBobrilStyleDef[];
    style: any;
    expStyle: any;
    inlStyle?: any;
    pseudo?: { [name: string]: string };
}

((b: IBobrilStatic, document: Document) => {
    var allStyles: { [id: string]: IInternalStyle } = Object.create(null);
    var allSprites: { [key: string]: ISprite } = Object.create(null);
    var allNameHints: { [name: string]: boolean } = Object.create(null);

    var rebuildStyles = false;
    var htmlStyle: HTMLStyleElement = null;
    var globalCounter: number = 0;
    const isIE9 = b.ieVersion() === 9;

    var chainedBeforeFrame = b.setBeforeFrame(beforeFrame);

    function buildCssRule(parent: string|string[], name: string): string {
        let result = "";
        if (parent) {
            if (b.isArray(parent)) {
                for (let i = 0; i < parent.length; i++) {
                    if (i > 0) result += ",";
                    result += "." + allStyles[parent[i]].name + "." + name;
                }
            } else {
                result = "." + allStyles[<string>parent].name + "." + name;
            }
        } else {
            result = "." + name;
        }
        return result;
    }

    function flattenStyle(cur: any, style: any): any {
        if (style === true || style === false || style == null) {
            return cur;
        }
        if (typeof style === "string") {
            let externalStyle = allStyles[style];
            if (externalStyle === undefined) throw new Error("uknown style " + style);
            return flattenStyle(cur, externalStyle.style);
        }
        if (typeof style === "function") {
            return style(cur);
        }
        if (b.isArray(style)) {
            for (let i = 0; i < style.length; i++) {
                cur = flattenStyle(cur, style[i]);
            }
            return cur;
        }
        for (let key in style) {
            if (!Object.prototype.hasOwnProperty.call(style, key)) continue;
            let val = style[key];
            if (typeof val === "function") {
                val = val(cur, key);
            }
            cur[key] = val;
        }
        return cur;
    }

    function beforeFrame() {
        if (rebuildStyles) {
            var stylestr = "";
            for (var key in allStyles) {
                var ss = allStyles[key];
                let parent = ss.parent;
                let name = ss.name;
                let style = flattenStyle(Object.create(null), ss.style);
                var extractedInlStyle: any = null;
                if (style["pointerEvents"]) {
                    extractedInlStyle = Object.create(null);
                    extractedInlStyle["pointerEvents"] = style["pointerEvents"];
                }
                if (isIE9) {
                    if (style["userSelect"]) {
                        if (extractedInlStyle == null)
                            extractedInlStyle = Object.create(null);
                        extractedInlStyle["userSelect"] = style["userSelect"];
                        delete style["userSelect"];
                    }
                }
                ss.inlStyle = extractedInlStyle;
                ss.expStyle = b.assign(Object.create(null), style); // clone it so it stays unshimed
                b.shimStyle(style);
                let cssStyle = inlineStyleToCssDeclaration(style);
                if (cssStyle.length > 0)
                    stylestr += buildCssRule(parent, name) + " {" + cssStyle + "}\n";
                var ssp = ss.pseudo;
                if (ssp) for (var key2 in ssp) {
                    let sspi = flattenStyle(Object.create(null), ssp[key2]);
                    b.shimStyle(sspi);
                    stylestr += buildCssRule(parent, name + ":" + key2) + " {" + inlineStyleToCssDeclaration(sspi) + "}\n";
                }
            }
            var styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            if ((<any>styleElement).styleSheet) {
                (<any>styleElement).styleSheet.cssText = stylestr;
            } else {
                styleElement.appendChild(document.createTextNode(stylestr));
            }

            var head = document.head || document.getElementsByTagName('head')[0];
            if (htmlStyle != null) {
                head.replaceChild(styleElement, htmlStyle);
            }
            else {
                head.appendChild(styleElement);
            }
            htmlStyle = styleElement;
            rebuildStyles = false;
        }
        chainedBeforeFrame();
    }

    function apply(s: IBobrilStyles, className: string, inlineStyle: any): [string, any] {
        if (typeof s === "boolean") {
            //skip
        } else if (typeof s === "string") {
            var sd = allStyles[s];
            if (inlineStyle != null) {
                inlineStyle = b.assign(inlineStyle, sd.expStyle);
            } else {
                if (className == null) className = sd.name; else className = className + " " + sd.name;
                var inls = sd.inlStyle;
                if (inls) {
                    if (inlineStyle == null) inlineStyle = inls;
                    else inlineStyle = b.assign(inlineStyle, inls);
                }
            }
        } else if (Array.isArray(s)) {
            for (var i = 0; i < (<IBobrilStyle[]>s).length; i++) {
                [className, inlineStyle] = apply((<IBobrilStyle[]>s)[i], className, inlineStyle);
            }
        } else {
            if (inlineStyle == null) inlineStyle = s;
            else inlineStyle = b.assign(inlineStyle, s);
        }
        return [className, inlineStyle];
    }

    function style(node: IBobrilNode, ...styles: IBobrilStyles[]): IBobrilNode {
        var className = node.className;
        var inlineStyle = node.style;
        for (var i = 0; i < styles.length; i++) {
            [className, inlineStyle] = apply(styles[i], className, inlineStyle);
        }
        node.className = className;
        node.style = inlineStyle;
        return node;
    }

    var uppercasePattern = /([A-Z])/g;
    var msPattern = /^ms-/;

    function hyphenateStyle(s: string): string {
        if (s === "cssFloat") return "float";
        return s.replace(uppercasePattern, '-$1').toLowerCase().replace(msPattern, '-ms-');
    }

    function inlineStyleToCssDeclaration(style: any): string {
        var res = "";
        for (var key in style) {
            var v = style[key];
            if (v === undefined) continue;
            res += hyphenateStyle(key) + ":" + (v === "" ? '""' : v) + ";";
        }
        res = res.slice(0, -1);
        return res;
    }

    function styleDef(style: any, pseudo?: { [name: string]: any }, nameHint?: string): IBobrilStyleDef {
        return styleDefEx(null, style, pseudo, nameHint);
    }

    function styleDefEx(parent: IBobrilStyleDef|IBobrilStyleDef[], style: any, pseudo?: { [name: string]: any }, nameHint?: string): IBobrilStyleDef {
        if (nameHint && nameHint !== "b-") {
            if (allNameHints[nameHint]) {
                var counter = 1;
                while (allNameHints[nameHint + counter]) counter++;
                nameHint = nameHint + counter;
            }
            allNameHints[nameHint] = true;
        } else {
            nameHint = "b-" + globalCounter++;
        }
        b.shimStyle(style);
        var processedPseudo: { [name: string]: string } = null;
        if (pseudo) {
            processedPseudo = Object.create(null);
            for (var key in pseudo) {
                if (!Object.prototype.hasOwnProperty.call(pseudo, key)) continue;
                processedPseudo[key] = pseudo[key];
            }
        }
        allStyles[nameHint] = { name: nameHint, parent, style, expStyle: null, inlStyle: null, pseudo: processedPseudo };
        invalidateStyles();
        return nameHint;
    }

    function invalidateStyles(): void {
        rebuildStyles = true;
        b.invalidate();
    }

    function updateSprite(spDef: ISprite): void {
        var stDef = allStyles[spDef.styleid];
        var style: any = { backgroundImage: `url(${spDef.url})`, width: spDef.width, height: spDef.height };
        if (spDef.left || spDef.top) {
            style.backgroundPosition = `${-spDef.left}px ${-spDef.top}px`;
        }
        stDef.style = style;
        invalidateStyles();
    }

    function sprite(url: string, color?: string, width?: number, height?: number, left?: number, top?: number): IBobrilStyleDef {
        var key = url + ":" + (color || "") + ":" + (width || 0) + ":" + (height || 0) + ":" + (left || 0) + ":" + (top || 0);
        var spDef = allSprites[key];
        if (spDef) return spDef.styleid;
        var styleid = styleDef({ width: 0, height: 0 });
        spDef = { styleid: styleid, url: url, width: width, height: height, left: left || 0, top: top || 0 };
        if (width == null || height == null || color != null) {
            var image = new Image();
            image.addEventListener("load", () => {
                if (spDef.width == null) spDef.width = image.width;
                if (spDef.height == null) spDef.height = image.height;
                if (color != null) {
                    var canvas = document.createElement("canvas");
                    canvas.width = spDef.width;
                    canvas.height = spDef.height;
                    var ctx = <CanvasRenderingContext2D>canvas.getContext("2d");
                    ctx.drawImage(image, -spDef.left, -spDef.top);
                    var imgdata = ctx.getImageData(0, 0, spDef.width, spDef.height);
                    var imgd = imgdata.data;
                    var cred = parseInt(color.substr(1, 2), 16);
                    var cgreen = parseInt(color.substr(3, 2), 16);
                    var cblue = parseInt(color.substr(5, 2), 16);
                    for (var i = 0; i < imgd.length; i += 4) {
                        if (imgd[i] === 0x80 && imgd[i + 1] === 0x80 && imgd[i + 2] === 0x80) {
                            imgd[i] = cred; imgd[i + 1] = cgreen; imgd[i + 2] = cblue;
                        }
                    }
                    ctx.putImageData(imgdata, 0, 0);
                    spDef.url = canvas.toDataURL();
                    spDef.left = 0;
                    spDef.top = 0;
                }
                updateSprite(spDef);
            });
            image.src = url;
        } else {
            updateSprite(spDef);
        }
        allSprites[key] = spDef;
        return styleid;
    }

    function spriteb(width: number, height: number, left: number, top: number): IBobrilStyleDef {
        let url = "bundle.png";
        var key = url + "::" + width + ":" + height + ":" + left + ":" + top;
        var spDef = allSprites[key];
        if (spDef) return spDef.styleid;
        var styleid = styleDef({ width: 0, height: 0 });
        spDef = { styleid: styleid, url: url, width: width, height: height, left: left, top: top };
        updateSprite(spDef);
        allSprites[key] = spDef;
        return styleid;
    }

    b.style = style;
    b.styleDef = styleDef;
    b.styleDefEx = styleDefEx;
    b.sprite = sprite;
    b.spriteb = spriteb;
    b.invalidateStyles = invalidateStyles;
})(b, document);
