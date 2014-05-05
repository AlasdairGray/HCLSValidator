function pad (d, str) {
    if (str === undefined) str = '  ';
    var ret = '';
    while (d-- > 0)
        ret += str;
    return ret;
}

function defix (term, prefixes) {
    if (term._ !== 'IRI')
        return term.toString();
    if (term.lex === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
        return 'a';
    for (var key in prefixes)
        if (term.lex.substr(0, prefixes[key].length) === prefixes[key])
            return key + ":" + term.lex.substr(prefixes[key].length);
    return term.toString();
}

function IntStringMap () {
    this.stringToInt = {};
    this.intToString = [];
    this.intToMembers = [];
    this.add = function (string) {
        if (this.stringToInt[string])
            return this.stringToInt[string];
        size = this.intToString.length;
        this.stringToInt[string] = size;
        this.intToString.push(string);
        this.intToMembers.push([]);
        return size;
    };
    this.addMember = function (member, offset) {
        if (offset === undefined) offset = this.intToMembers.length - 1;
        if (this.intToMembers.indexOf(member) == -1)
            this.intToMembers[offset].push(member);
    };
    this.getInt = function (str) { return this.stringToInt[str]; }
    this.getString = function (i) { return this.intToString[i]; }
    this.getMembers = function (offset) {
        if (offset === undefined) offset = this.intToMembers.length - 1;
        return this.intToMembers[offset];
    };
};

function CharMap (text, offsets) {
    this.text = text || '';
    this.offsets = offsets;
    if (this.offsets == undefined) {
        this.offsets = [];
        var i;
        for (i = 0; i < text.length; ++i) {
            this.text[i] = text[i];
            this.offsets[i] = i;
        }
        this.offsets[i] = i;
    };

    this.length = function () { return this.offsets.length - 1; };

    this.insertBefore = function (offset, str, skip) {
        this.text = this.text.substr(0, this.offsets[offset] + skip) + str + this.text.substr(this.offsets[offset] + skip);
        this.offsets = this.offsets.slice(0, offset+1)
            .concat(this.offsets.slice(offset+1).map(
                function (el) {
                    return el + str.length;
                }
            ));
    };

    this.insertAfter = function (offset, str, skip) {
        this.text = this.text.substr(0, this.offsets[offset] + skip) + str + this.text.substr(this.offsets[offset] + skip);
        this.offsets = this.offsets.slice(0, offset)
            .concat(this.offsets.slice(offset).map(
                function (el) {
                    return el + str.length;
                }
            ));
    };

    this.replace = function (offset, str) {
        this.text = this.text.substr(0, this.offsets[offset]) + str + this.text.substr(this.offsets[offset]+1);
        this.offsets = this.offsets.slice(0, offset+1)
            .concat(this.offsets.slice(offset+1).map(
                function (el) {
                    return el + str.length - 1;
                }
            ));
    };

    this.HTMLescape = function () {
        var copy = this.text;
        for (var i = 0; i < copy.length; ++i) {
            switch (copy[i]) {
            case "<":
                this.replace(i, "&lt;");
                break;
            case ">":
                this.replace(i, "&gt;");
                break;
            default:
            }            
        }
    };
};

function SPARQLCardinality (min, max) {
    var ret = '';
    if (min === 0 && max === undefined)
        ;
    else {
        ret += " HAVING ("
        if (min === max)
            ret += "COUNT(*)=" + min;
        else {
            if (min !== 0)
                ret += "COUNT(*)>=" + min;
            if (min !== 0 && max !== undefined)
                ret += " && ";
            if (max !== undefined)
                ret += "COUNT(*)<=" + max;
        }
        ret += ")";
    }
    return ret;
}

function ResourceShapeCardinality (min, max, sePrefix, rsPrefix, seFix, rsFix) {
    if (min == 1 && max == 1) {
        return rsFix + "occurs " + rsPrefix + ":Exactly-one ;\n";
    } else if (min == 0 && max == 1) {
        return rsFix + "occurs " + rsPrefix + ":Zero-or-one ;\n";
    } else if (min == 0 && max == undefined) {
        return rsFix + "occurs " + rsPrefix + ":Zero-or-many ;\n";
    } else if (min == 1 && max == undefined) {
        return rsFix + "occurs " + rsPrefix + ":One-or-many ;\n";
    } else {
        return seFix + "min " + min + " ;\n"
            + seFix + (max === undefined ? "maxundefined true" : "max " + max) + " ;\n";
    }
}

    function codesToSExpression (codes, depth) {
        var lead = pad(depth, '    ');
        if (codes === undefined)
            return "";
        return Object.keys(codes).map(function (k) {
            return "\n" + lead + codes[k].toSExpression(depth+1);
        }).join("");
    }

    function codesToHaskell (codes, depth) {
        var lead = pad(depth, '    ');
        if (codes === undefined)
            return "";
        return Object.keys(codes).map(function (k) {
            return "\n" + lead + codes[k].toHaskell(depth+1);
        }).join("");
    }

RDF = {
    message: function (str) {
        console.error(str);
    },

    // SPARQL validation queries can't expression recursive grammars.
    ValidationRecursion: function (label) {
        this._ = 'ValidationRecursion'; this.label = label;
    },

    UnknownRule: function (label) {
        this._ = 'UnknownRule'; this.label = label;
        this.toString = function () {
            return "Rule " + this.label.toString() + " not found in schema."
        }
    },

    createIRIResolver: function() {
        return {
            errorHandler: function (message) { throw message; },

            // make a copy, usually to have a new prefix map. e.g.
            //   var prefixes = r.schemaIRIResolver.clone().Prefixes;
            //   prefixes['se'] = "http://www.w3.org/2013/ShEx/Definition#";
            clone: function () {
                var ret = { Prefixes:{} };
                for (var p in this)
                    if (p != 'Prefixes')
                        ret[p]=this[p];
                for (var p in this.Prefixes)
                    ret.Prefixes[p]=this.Prefixes[p];
                return ret;
            },

            Base: '',
            setBase: function (base) {
                this.Base = base;
            },
            getBase: function (base) {
                return this.Base;
            },

            Prefixes: {},
            setPrefix: function (pre, i) {
                this.Prefixes[pre] = i;
            },
            getPrefix: function (pre) {
                // unescapeReserved
                var nspace = this.Prefixes[pre];
                if (nspace == undefined) {
                    this.errorHandler("unknown namespace prefix: " + pre);
                    // throw("unknown namespace prefix: " + pre);
                    RDF.message("unknown namespace prefix: " + pre);
                    nspace = '<!' + pre + '!>'
                }
                return nspace;
            },

            getAbsoluteIRI: function (rel) {
                var relProtHostPath  = /^(?:([a-z]+:)?(\/\/[^\/]+))?(.*?)$/.exec(rel);
                var baseProtHostPath = /^(?:([a-z]+:)?(\/\/[^\/]+))?(.*?)[^\/]*$/.exec(this.getBase());
                var prot = relProtHostPath[1] || baseProtHostPath[1] || "";
                var host = relProtHostPath[2] || baseProtHostPath[2] || "";
                var path = relProtHostPath[3].charAt() === '/' ? relProtHostPath[3] : baseProtHostPath[3] + relProtHostPath[3];
                path = path.replace(/\/(\.\/)*/g, '/');
                path = path.replace(/\/\/+/g, '/');
                var startAt = path.match(/^(\/\.\.)*/g)[0].length;
                var prepend = path.substr(0,startAt);
                path = path.substr(startAt);
                while (path.match(/\/\.\./)) {
                    path
                        = path.match(/\/\.\.$/)
                        ? path.replace(/\/([^\/]*?)\/\.\.$/, '')
                        : path.replace(/\/([^\/]*?)\/\.\.\//, '/');
                    var startAt = path.match(/^(\/\.\.)*/g)[0].length;
                    prepend += path.substr(0,startAt);
                    path = path.substr(startAt);
                }
                if ((prot || host) && !path)
                    path = "/";
                return prot + host + prepend + path;
            },
            oldAttemptsAt_getAbsoluteIRI: function (url) {
                if (url.indexOf('//') > 0 || this.getBase() == undefined)
                    return url;
                return this.getBase().substr(0, this.getBase().lastIndexOf('/') + 1) + url;
                var doc      = document,
                old_base = doc.getElementsByTagName('base')[0],
                old_href = old_base && old_base.href,
                doc_head = doc.head || doc.getElementsByTagName('head')[0],
                our_base = old_base || doc_head.appendChild(doc.createElement('base')),
                resolver = doc.createElement('a'),
                resolved_url;
                our_base.href = this.getBase();
                resolver.href = url;
                resolved_url  = resolver.href; // browser magic at work here
                if (old_base) old_base.href = old_href;
                else doc_head.removeChild(our_base);
                return resolved_url;
            }
        };
    },

    DISPOSITION: {
        PASS :      {value: 1, name: "pass"      }, 
        FAIL:       {value: 3, name: "fail"      }, 
        EMPTY:      {value: 0, name: "empty"     },
        INDEFINITE: {value: 2, name: "indefinite"}
    },

    SPARQLprefixes: function (prefixes) {
        var ret = '';
        var keys = Object.keys(prefixes);
        keys.sort();
        for (var i in keys)
            ret += "PREFIX " + keys[i] + ":<" + prefixes[keys[i]] + ">\n";
        return ret;
    },

    decodeUCHAR: function (el) {
        if (el.length == 1) return el;
        var code;
        if (el.length==9)
            code = parseInt(el.slice(1,9).join(''), 16)
        if (el.length==5)
            code = parseInt(el.slice(1,5).join(''), 16)
        if (code<0x10000) { // RDFa.1.2.0.js:2712
            return String.fromCharCode(code);
        } else {
            // Evil: generate surrogate pairs
            var n = code - 0x10000;
            var h = n >> 10;
            var l = n & 0x3ff;
            return String.fromCharCode(h + 0xd800) + String.fromCharCode(l + 0xdc00);
        }
    },
    // Turtle types
    IRI: function (line, column, offset, width, lex) {
        this._ = 'IRI'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.lex = lex; this.id = undefined;
        this.toString = function () {
            return '<' + this.lex + '>';
        },
        this.assignId = function (charmap, id) {
            if (this.id === undefined) {
                this.id = id;
                charmap.insertBefore(this.offset, "<span id='"+id+"' class='IRI'>", 0);
                charmap.insertAfter(this.offset+this.width, "</span>", 0);
            }
            return this.id;
        }
    },
    RDFLiteral: function (line, column, offset, width, lex, langtag, datatype) {
        this._ = 'RDFLiteral'; this.line = line; this.column = column; this.offset = offset; this.width = width+2; this.lex = lex; this.langtag = langtag; this.datatype = datatype; this.id = undefined;
        this.toString = function () {
            var ret = '"' + this.lex + '"';
            if (this.langtag != undefined)
                ret += '@' + this.langtag.toString();
            if (this.datatype != undefined)
                ret += '^^' + this.datatype.toString();
            return ret;
        };
        this.assignId = function (charmap, id) {
            if (this.id === undefined) {
                this.id = id;

                // Adding the markup for the lexical form before the datatype or
                // langtag takes advantage of the insert order and renders an
                // irrelevent datatype tag for native types (integer, decimal,
                // real).
                charmap.insertBefore(this.offset, "<span id='"+id+"' class='literal'>", 0);
                charmap.insertAfter(this.offset+this.width-2, "</span>", 0); // !! needed to prevent two extra chars getting colored, but why?!
                // if (this.langtag != undefined)
                //     this.langtag.assignId(charmap, id);
                if (this.datatype != undefined)
                    this.datatype.assignId(charmap, id);
                if (this.langtag != undefined)
                    this.langtag.assignId(charmap, id);
            }
            return this.id;
        };
    },
    LangTag: function (line, column, offset, width, lex) {
        this._ = 'LangTag'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.lex = lex; this.id = undefined;
        this.toString = function () {
            return this.lex;
        },
        this.assignId = function (charmap, id) {
            if (this.id === undefined) {
                this.id = id;
                charmap.insertBefore(this.offset, "<span id='"+id+"' class='langtag'>", 0);
                charmap.insertAfter(this.offset+this.width, "</span>", 0);
            }
            return this.id;
        }
    },
    BNode: function (line, column, offset, width, lex) {
        this._ = 'BNode'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.lex = lex; this.id = undefined;
        this.toString = function () {
            return '_:' + this.lex;
        };
        this.assignId = function (charmap, id) {
            if (this.id === undefined) {
                this.id = id;
                charmap.insertBefore(this.offset, "<span id='"+id+"' class='bnode'>", 0);
                charmap.insertAfter(this.offset+this.width, "</span>", 0);
            }
            return this.id;
        };
    },
    NextBNode: 0,
    nextBNode: function (line, column, offset, width) {
        return new RDF.BNode(line, column, offset, width, ''+this.NextBNode++); // needs mutex
    },

    Triple: function (s, p, o) {
        this._ = 'Triple'; this.s = s; this.p = p; this.o = o;
        this.toString = function () {
            return this.s.toString() + ' ' + this.p.toString() + ' ' + this.o.toString() + '.';
        },
        this.colorize = function (charmap, idMap) {
            var tripleId = "t"+idMap.add(this.toString());
            // Assignid permits only one XML ID for a given term *rendering*.
            idMap.addMember(this.s.assignId(charmap, tripleId+"_s"));
            idMap.addMember(this.p.assignId(charmap, tripleId+"_p"));
            idMap.addMember(this.o.assignId(charmap, tripleId+"_o"));
        }
    },

    DB: function () {
        this._ = 'DB'; this.triples = new Array();
        this.triplesMatching = function (s, p, o) {
            var ret = [];
            for (var i = 0; i < this.triples.length; ++i) {
                var t = this.triples[i];
                if ((s === undefined || s === t.s)
                    && (p === undefined || p === t.p)
                    && (o === undefined || o === t.o))
                    ret.push(t);
            }
            return ret;
        },
        this.triplesMatching_str = function (s, p, o) {
            var ret = [];
            for (var i = 0; i < this.triples.length; ++i) {
                var t = this.triples[i];
                if (   (s === undefined || s === t.s.toString())
                    && (p === undefined || p === t.p.toString())
                    && (o === undefined || o === t.o.toString()))
                    ret.push(t);
            }
            return ret;
        },
        this.length = function () {
            return this.triples.length;
        },
        this.slice = function (from, length) {
            return this.triples.slice(from, length);
        },
        this.clone = function () {
            var ret = new RDF.DB();
            ret.triples = this.triples.slice();
            return ret;
        }
        this.splice = function (from, length) {
            return this.triples.splice(from, length);
        },
        this.push = function (t) {
            this.triples.push(t);
        },
        this.toString = function () {
            return this.triples.map(function (t) { return t.toString(); }).join("\n");
        },
        this.colorize = function (charmap) {
            var idMap = new IntStringMap();
            for (var i = 0; i < this.triples.length; ++i)
                this.triples[i].colorize(charmap, idMap);
            return idMap;
        }
    },

    // ShEx types
    Code: function (line, column, offset, width, label, code) {
        this._ = 'Code'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.label = label; this.code = code;
        this.toString = function () {
            return '%' + this.label + '{' + this.code + '%}';
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            return seFix + "extension [\n"
                + "    " + seFix + "label \"" + this.label + "\" ;\n"
                + "    " + seFix + "action \"\"\"" + this.code + "\"\"\"\n"
                + lead + "] ;\n";
        }
        this.toSExpression = function (depth) {
            return "(code \""+this.label+"\" \""+this.code+"\")";
        }
        this.toHaskell = function (depth) {
            return "(code \""+this.label+"\" \""+this.code+"\")";
        }
    },

    Comment: function (line, column, offset, width, comment) {
        this._ = 'Comment'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.comment = comment;
        this.toString = function () {
            return '#' + this.comment;
        }
    },


    NameTerm: function (line, column, term) {
        this._ = 'NameTerm'; this.line = line; this.column = column; this.term = term;
        this.toString = function () {
            return this.term.toString();
        }
        this.match = function (t2) {
            return t2.toString() == this.term.toString();
        }
        this.SPARQLpredicate = function (prefixes) { // @@ simplify later
            return defix(this.term, prefixes);
        }
        this.SPARQLpredicateTest = function (prefixes) {
            return "true";
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var t = defix(this.term, prefixes);
            return rsFix + "name \"" + t.substr(t.indexOf(':')+1) + "\" ;\n"
                + rsFix + "propertyDefinition " + this.SPARQLpredicate(prefixes) + " ;\n";
        }
        this.toSExpression = function (depth) {
            return "(NameTerm "+this.term.toString()+")";
        }
        this.toHaskell = function (depth) {
            return "(NameTerm "+this.term.toString()+")";
        }
    },
    NameWild: function (line, column, exclusions) {
        this._ = 'NameWild'; this.line = line; this.column = column; this.exclusions = exclusions;
        this.toString = function () {
            var ret = '.';
            ret += this.exclusions.map(function (ex) { return ' - ' + ex.toString(); }).join('');
            return ret;
        }
        this.SPARQLpredicate = function (prefixes) { // @@ simplify later
            return "?p";
        },
        this.SPARQLpredicateTest = function (prefixes) {
            return "true"; // defix(this.term, prefixes)
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            if (exclusions.length)
                throw "expressing NameWild with exclusions " + this.toString() + " will require some fancy POWDER.";
            return '';
        }
        this.toSExpression = function (depth) {
            return "(NameWild "+(this.exclusions.map(function(ex){return ex.toString();}).join(' '))+")";
        }
        this.toHaskell = function (depth) {
            return "(NameWild "+(this.exclusions.map(function(ex){return ex.toString();}).join(' '))+")";
        }
    },
    NamePattern: function (line, column, term) {
        this._ = 'NamePattern'; this.line = line; this.column = column; this.term = term;
        this.toString = function () {
            return this.term.toString() + '~';
        }
        this.SPARQLpredicate = function (prefixes) { // @@ simplify later
            return "?p";
        }
        this.SPARQLpredicateTest = function (prefixes) {
            return "true"; // defix(this.term, prefixes)
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var t = defix(this.term, prefixes);
            return seFix + "name \"" + t.substr(0, t.indexOf(':')) + ":*\" ;\n"
                + seFix + "propertyStem " + this.SPARQLpredicate(prefixes) + " ;\n";
        }
        this.toSExpression = function (depth) {
            return "(NamePattern "+this.term.toString()+")";
        }
        this.toHaskell = function (depth) {
            return "(NamePattern "+this.term.toString()+")";
        }
    },

    QueryClause: function (counter, sparql) {
        this._ = 'QueryClause'; this.counter = counter; this.min = undefined; this.max = undefined; this.sparql = sparql;
        this.prepend = function (str) {
            this.sparql = str + this.sparql;
            return this;
        }
        this.append = function (str) {
            this.sparql += str;
            return this;
        }
    },

    /*
      needCounter: either we in are an optional group or we're testing a ValueReference
      card: undefined if we can't test cardinality (i.e. we're in a group) or {min:Int, max:Int}
     */
    arcCount: function (schema, label, prefixes, depth, counters, needCounter, predicate, predicateTest, object, objectTest, card, code) {
        var lead = pad(depth, '    ');
        var countSelect = '';
        var counter = undefined;
        var codeStr = code ? "\n" + lead + ' ' + code.code.replace('?s', '?' + label.lex) : '';
        if (needCounter) {
            counter = counters.incr(label.lex + "_c");
            countSelect = " (COUNT(*) AS " + counter + ")";
        }
        var cardStr = card === undefined ? '' : SPARQLCardinality(card.min, card.max)
        var str = lead
            + "{ SELECT ?" + label.lex + countSelect + " {\n"
            + lead + "  ?" + label.lex + " "
            + predicate + " " + object
            + " . FILTER ("
            + predicateTest + " && " + objectTest + ")" + codeStr + "\n"
            + lead + "} GROUP BY ?" + label.lex
            + cardStr + "}\n";
        return new RDF.QueryClause(counter, str);
    },
    arcTest: function (schema, label, prefixes, depth, counters, needCounter, predicate, predicateTest, object, objectTest, card, code) {
        // var needFilter = needCounter;
        // return this.arcCount(schema, label, prefixes, depth, counters, needFilter, predicate, predicateTest, object, objectTest, card, code);
        var lead = pad(depth, '    ');
        var needFilter = card === undefined || card.min != card.max;

        var byPredicate = this.arcCount(schema, label, prefixes, depth, counters, needCounter || needFilter, predicate, predicateTest, "?o", "true", card, undefined);
        var withObject = this.arcCount(schema, label, prefixes, depth, counters, needFilter, predicate, predicateTest, object, objectTest, card, code);
        byPredicate.append(withObject.sparql);
        if (needFilter)
            byPredicate.append(lead + "FILTER (" + byPredicate.counter + " = " + withObject.counter + ")\n");
        return byPredicate;
    },
    arcSelect: function (schema, as, prefixes, depth, counters, predicate, predicateTest, object, objectTest) {
        var lead = pad(depth, '    ');
        var countSelect = '';
        var counter = undefined;
        var str =
            lead + "  { " + as + " "
            + predicate + " " + object
            + " . FILTER ("
            + predicateTest + " && " + objectTest + ") BIND (" + as + " AS ?s) BIND (" + predicate + " AS ?p) }";
        return new RDF.QueryClause(counter, str);
    },

    // @<foo>
    ValueReference: function (line, column, offset, width, label) {
        this._ = 'ValueReference'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.label = label;
        this.toString = function () {
            return '@' + this.label.toString();
        },
        this.validate = function (schema, rule, t, db) {
            var ret = new RDF.ValRes();
            schema.dispatch('enter', rule.codes, rule, t);
            var r = schema.validatePoint(t.o, this.label, db, true);
            schema.dispatch('exit', rule.codes, rule, r);
            ret.status = r.status;
            if (r.passed())
                { ret.status = r.status; ret.matchedTree(rule, t, r); }
            else
                { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatchTree(rule, t, r); }
            return ret;
        },
        this.SPARQLobject = function (prefixes) {
            return "?o";
        },
        this.SPARQLobjectTest = function (prefixes) {
            return "(isIRI(?o) || isBlank(?o))";
        }
        this.SPARQLobjectJoin = function (schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, card, code) {
            inOpt = 1;
            var ret = RDF.arcTest(schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes), card, code);
            var lead1 = pad(depth, '    ');
            var lead2 = pad(depth+1, '    ');
        var countSelect = '';
        var counter = undefined;
        if (inOpt) {
            counter = counters.incr(label.lex + "_c");
            countSelect = " (COUNT(*) AS " + counter + ")";
        }
            try {
                
                ret.append(
                    lead1 + "{ SELECT ?" + label.lex + countSelect + " {\n"
                        + lead2 + "{ SELECT ?" + label.lex + " ?" + this.label.lex + " {\n"
                        + lead2 + "  ?" + label.lex + " " + predicate + " ?" + this.label.lex
                        + " . FILTER (" + predicateTest + " && (isIRI(?" + this.label.lex + ") || isBlank(?" + this.label.lex + ")))\n"
                        + lead2 + "} }\n"
                        + schema.SPARQLvalidation3(this.label, prefixes, depth+1, counters).sparql
                        + lead1 + "} GROUP BY ?" + label.lex + " }\n"
                        + lead1 + "FILTER (" + ret.counter + " = " + counter + ")\n");
                var o = counters.incr(label.lex + '_' + this.label.lex + "_ref");
                ret.append(
                    lead1 + "OPTIONAL { ?" + label.lex + " " + predicate + " " + o
                        + " . FILTER (" + predicateTest + " && (isIRI(" + o + ") || isBlank(" + o + "))) }\n");
            } catch (e) {
                if (typeof(e) === 'object' && e._ === 'ValidationRecursion')
                    RDF.message("avoiding cyclic validation of " + e.label.toString());
                else
                    throw e;
            }
            return ret;
        }
        this.SPARQLobjectSelect = function (schema, label, as, prefixes, depth, counters, predicate, predicateTest) {
            var ret = RDF.arcSelect(schema, as, prefixes, depth, counters, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes));
            var lead1 = pad(depth, '    ');
            var lead2 = pad(depth+1, '    ');
            try {
                var nestedLabel = counters.incr(as.substr(1) + '_' + this.label.lex + '_ref'); // !! remove '?'s from incr
                ret.append( " UNION\n"
                    + lead1 + "  {\n"
                        + lead2 + "{ " + as + " " + predicate + " " + nestedLabel
                        + " . FILTER (" + predicateTest + " && (isIRI(" + nestedLabel + ") || isBlank(" + nestedLabel + "))) }\n"
                            + lead2 + "{\n"
                            + schema.SPARQLremainingTriples3(this.label, nestedLabel, prefixes, depth+1, counters).sparql + "\n"
                            + lead2 + "}\n"
                        + lead1 + "  }");
            } catch (e) {
                if (typeof(e) === 'object' && e._ === 'ValidationRecursion')
                    RDF.message("avoiding cyclic validation of " + e.label.toString());
                else
                    throw e;
            }
            return ret;
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            return rsFix + "valueShape " + defix(this.label, prefixes) + " ;\n";
        }
        this.toSExpression = function (depth) {
            return "(ValueRef "+this.label.toString()+")";
        }
        this.toHaskell = function (depth) {
            return "(ValueRef "+this.label.toString()+")";
        }
    },

    // IRI | LITERAL | xsd:integer
    ValueType: function (line, column, offset, width, type) {
        this._ = 'ValueType'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.type = type;
        this.toString = function () {
            return this.type.toString();
        },
        this.validate = function (schema, rule, t, db) {
            function passIf (b) {
                if (b) { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
                else { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
            };
            var ret = new RDF.ValRes();
            if      (this.type.toString() == "<http://www.w3.org/2013/ShEx/ns#Literal>")
                passIf(t.o._ == "RDFLiteral");
            else if (this.type.toString() == "<http://www.w3.org/2013/ShEx/ns#IRI>")
                passIf(t.o._ == "IRI");
            else if (this.type.toString() == "<http://www.w3.org/2013/ShEx/ns#BNode>")
                passIf(t.o._ == "BNode");
            else if (this.type.toString() == "<http://www.w3.org/2013/ShEx/ns#NonLiteral>")
                passIf(t.o._ == "BNode" || t.o._ == "IRI");
            else if (t.o._ == "RDFLiteral") {
                if (t.o.datatype == undefined) {
                    passIf(this.type.toString() == "<http://www.w3.org/2001/XMLSchema#string>");
                } else {
                    passIf(t.o.datatype.toString() == this.type.toString());
                }
            } else { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
            return ret;
        },
        this.SPARQLobject = function (prefixes) {
            return "?o";
        },
        this.SPARQLobjectTest = function (prefixes) {
            var s = this.type.toString();
            if (s == "<http://www.w3.org/2013/ShEx/ns#Literal>") return "isLiteral(?o)";
            if (s == "<http://www.w3.org/2013/ShEx/ns#NonLiteral>") return "(isIRI(?o) || isBlank(?o))";
            if (s == "<http://www.w3.org/2013/ShEx/ns#IRI>") return "isIRI(?o)";
            if (s == "<http://www.w3.org/2013/ShEx/ns#BNode>") return "isBlank(?o)";
            return "(isLiteral(?o) && datatype(?o) = " + defix(this.type, prefixes) + ")";
        }
        this.SPARQLobjectJoin = function (schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, card, code) {
            return RDF.arcTest(schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes), card, code);
        }
        this.SPARQLobjectSelect = function (schema, label, as, prefixes, depth, counters, predicate, predicateTest) {
            return RDF.arcSelect(schema, as, prefixes, depth, counters, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes));
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            return rsFix + "valueType " + defix(this.type, prefixes) + " ;\n";
        }
        this.toSExpression = function (depth) {
            return "(ValueType "+this.type.toString()+")";
        }
        this.toHaskell = function (depth) {
            return "(ValueType "+this.type.toString()+")";
        }
    },

    // (1 2 3)
    ValueSet: function (line, column, offset, width, values) {
        this._ = 'ValueSet'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.values = values;
        this.toString = function () {
            return '(' + this.values.map(function (v) { return v.toString(); }).join(' ') + ')';
        },
        this.validate = function (schema, rule, t, db) {
            for (var i = 0; i < this.values.length; ++i) {
                if (t.o.toString() == this.values[i].toString()) {
                    var ret = new RDF.ValRes();
                    { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
                    return ret;
                }
            }
            var ret = new RDF.ValRes();
            { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
            return ret;
        },
        this.SPARQLobject = function (prefixes) {
            return "?o";
        },
        this.SPARQLobjectTest = function (prefixes) {
            return "(" + this.values.map(function (v) {
                return "?o = " + defix(v.type, prefixes);
            }).join(" || ") + ")";
        }
        this.SPARQLobjectJoin = function (schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, card, code) {
            return RDF.arcTest(schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes), card, code);
        }
        this.SPARQLobjectSelect = function (schema, label, as, prefixes, depth, counters, predicate, predicateTest) {
            return RDF.arcSelect(schema, as, prefixes, depth, counters, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes));
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            return rsFix + "allowedValue " + this.values.map(function (v) {
                return defix(v, prefixes)
            }).join(' , ') + " ;\n";
        }
        this.toSExpression = function (depth) {
            return "(ValueSet "+(this.values.map(function(ex){return ex.toString();}).join(' '))+")";
        }
        this.toHaskell = function (depth) {
            return "(ValueSet "+(this.values.map(function(ex){return ex.toString();}).join(' '))+")";
        }
    },

    // . - <foo> - <bar>~
    ValueWild: function (line, column, offset, width, exclusions) {
        this._ = 'ValueWild'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.exclusions = exclusions;
        this.toString = function () {
            var x = exclusions.map(function (t) { return t.toString(); });
            x.unshift('.');
            return x.join(' ');
        }
        this.validate = function (schema, rule, t, db) {
            for (var i = 0; i < this.exclusions.length; ++i) {
                if (this.exclusions[i].matches(t.o)) {
                    var ret = new RDF.ValRes();
                    { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
                    return ret;
                }
            }
            var ret = new RDF.ValRes();
            { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
            return ret;
        },
        this.SPARQLobject = function (prefixes) {
            return "?o";
        },
        this.SPARQLobjectTest = function (prefixes) {
            if (exclusions.length === 0)
                return "true";
            return "(" + this.exclusions.map(function (v) {
                return "?o !" + v.asSPARQLfilter(prefixes);
            }).join(" && ") + ")";
        }
        this.SPARQLobjectJoin = function (schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, card, code) {
            return RDF.arcTest(schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes), card, code);
        }
        this.SPARQLobjectSelect = function (schema, label, as, prefixes, depth, counters, predicate, predicateTest) {
            return RDF.arcSelect(schema, as, prefixes, depth, counters, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes));
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            return "# haven't made up some schema for ValueWild yet.\n";
        }
        this.toSExpression = function (depth) {
            return "(ValueWild "+(this.exclusions.map(function(ex){return ex.toString();}).join(' '))+")";
        }
        this.toHaskell = function (depth) {
            return "(ValueWild "+(this.exclusions.map(function(ex){return ex.toString();}).join(' '))+")";
        }
    },

    // <foo>~
    ValuePattern: function (line, column, offset, width, term) {
        this._ = 'ValuePattern'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.term = term;
        this.toString = function () {
            return this.term.toString() + '~';
        }
        this.validate = function (schema, rule, t, db) {
            if (t.o.lex.substr(0,this.term.lex.length) !== this.term.lex) {
                var ret = new RDF.ValRes();
                { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
                return ret;
            }
            var ret = new RDF.ValRes();
            { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
            return ret;
        },
        this.SPARQLobject = function (prefixes) {
            return "?o";
        },
        this.SPARQLobjectTest = function (prefixes) {
            return "(regex(STR(?o), \"^" + this.term.lex + "\"))";
        }
        this.SPARQLobjectJoin = function (schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, card, code) {
            // throw "SPARQLobjectJoin of ValuePattern " + this.toString() + " needs attention.";
            return RDF.arcTest(schema, label, prefixes, depth, counters, inOpt, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes), card, code);
        }
        this.SPARQLobjectSelect = function (schema, label, as, prefixes, depth, counters, predicate, predicateTest) {
            // throw "SPARQLobjectSelect of ValuePattern " + this.toString() + " needs attention.";
            return RDF.arcSelect(schema, as, prefixes, depth, counters, predicate, predicateTest, this.SPARQLobject(prefixes), this.SPARQLobjectTest(prefixes));
        }
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            return "# haven't made up some schema for ValuePattern yet (POWDER?).\n";
        }
        this.toSExpression = function (depth) {
            return "(ValuePattern "+this.term.toString()+")";
        }
        this.toHaskell = function (depth) {
            return "(ValuePattern "+this.term.toString()+")";
        }
    },

    AtomicRule: function (line, column, offset, width, reversed, nameClass, valueClass, min, max, codes) {
        this._ = 'AtomicRule'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.reversed = reversed; this.nameClass = nameClass; this.valueClass = valueClass; this.min = min; this.max = max; this.codes = codes;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) { this.label = label; }
        this.toKey = function () { return this.label.toString() + ' ' + this.toString(); }
        this.toString = function () {
            var ret = '';
            if (reversed) ret += '^';
            ret += nameClass.toString() + ' ';
            ret += valueClass.toString();
            if (min == 1 && max == 1) {
            } else if (min == 0 && max == 1) {
                ret += '?';
            }  else if (min == 0 && max == undefined) {
                ret += '*';
            }  else if (min == 1 && max == undefined) {
                ret += '+';
            } else {
                ret += '{' + min;
                if (max != undefined) { ret += ', ' + max; }
                ret += '}';
            }
            var AtomicRule = this;
            Object.keys(this.codes).map(function (k) { ret += " " + AtomicRule.codes[k].toString(); })
            return ret;
        };
        this.colorize = function (charmap, idMap) {
            var ruleId = "r" + idMap.add(this.toKey());
            this.label.assignId(charmap, ruleId+"_s"); // @@ could idMap.addMember(...), but result is more noisy
            charmap.insertBefore(this.offset, "<span id='"+ruleId+"' class='rule'>", 0);
            charmap.insertAfter(this.offset+this.width, "</span>", 0);
            var AtomicRule = this;
            Object.keys(this.codes).map(function (k) {
                charmap.insertBefore(AtomicRule.codes[k].offset, "<span id='"+ruleId+"_"+k+"' class='code'>", 0);
                charmap.insertAfter(AtomicRule.codes[k].offset+codes[k].width, "</span>", 0);
            });
        };
        // only returns ∅|𝜃 if inOpt
        // ArcRule: if (inOpt ∧ SIZE(matchName)=0) if (min=0) return 𝜃 else return ∅;
        // if(SIZE(matchName)<min|>max) return 𝕗;
        // vs=matchName.map(valueClass(v,_,g,false)); if(∃𝕗) return 𝕗; return dispatch('post', 𝕡);
        this.validate = function (schema, point, inOpt, db) {
            var matched = 0;
            var ret = new RDF.ValRes();
            ret.status = RDF.DISPOSITION.PASS;
            var _AtomicRule = this;
            var matchName = [];
            for (var i = 0; i < db.triples.length; ++i) {
                var t = db.triples[i];
                if (point.toString() == t.s.toString() && this.nameClass.match(t.p))
                    matchName.push(t);
            }
            if (inOpt && matchName.length == 0)
                { ret.status = min == 0 ? RDF.DISPOSITION.INDEFINITE : RDF.DISPOSITION.EMPTY; ret.matchedEmpty(this); }
            else if (matchName.length < this.min)
                { ret.status = RDF.DISPOSITION.FAIL; ret.error_belowMin(this.min, this); }
            else if (matchName.length > this.max)
                { ret.status = RDF.DISPOSITION.FAIL; ret.error_aboveMax(this.max, this, matchName[this.max]); }
            else {
                for (var i = 0; i < matchName.length; ++i) {
                    var t = matchName[i];
                    var r = this.valueClass.validate(schema, this, t, db);
                    if (this.valueClass._ != 'ValueReference')
                        schema.dispatch('visit', this.codes, r, t);
                    if (!r.passed()) {
                        ret.status = RDF.DISPOSITION.FAIL;
                        ret.add(r);
                    } else {
                        if (schema.dispatch('post', this.codes, r, t) == RDF.DISPOSITION.FAIL)
                            ret.status = RDF.DISPOSITION.FAIL;
                        ret.add(r);
                    }
                }
            }
            return ret;
        };
        this.SPARQLvalidation = function (schema, label, prefixes, depth, counters, inOpt) {
            var lead = pad(depth, '    ');
            var ret =
                this.valueClass.SPARQLobjectJoin(schema, label, prefixes, depth, counters, inOpt,
                                                 this.nameClass.SPARQLpredicate(prefixes),
                                                 this.nameClass.SPARQLpredicateTest(prefixes),
                                                 // if we are in an optional, we mustn't test card constraints.
                                                 inOpt ? undefined : {min:this.min, max:this.max},
                                                 this.codes["sparql"]);
            ret.min = this.min;
            ret.max = this.max;
            return ret;
        };
        this.SPARQLremainingTriples = function (schema, label, as, prefixes, depth, counters) {
            var lead = pad(depth, '    ');
            var ret =
                this.valueClass.SPARQLobjectSelect(schema, label, as, prefixes, depth, counters,
                                                   this.nameClass.SPARQLpredicate(prefixes),
                                                   this.nameClass.SPARQLpredicateTest(prefixes))
            return ret;
        };
        this.toResourceShapes = function (db, prefixes, sePrefix, rsPrefix, depth) {
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.nameClass.toResourceShapes(db, prefixes, sePrefix, rsPrefix, depth);
            ret += this.valueClass.toResourceShapes(db, prefixes, sePrefix, rsPrefix, depth);
            ret += ResourceShapeCardinality(this.min, this.max, sePrefix, rsPrefix, seFix, rsFix);
            if (this.ruleID) // !!! some day this will be a bnode
            for (var i = 0; i < db.triples.length; ++i) {
                var t = db.triples[i];
                if (t.s.toString() == this.ruleID.toString()) {
                    ret += lead + defix(t.p, prefixes) + " " + defix(t.o, prefixes) + " ;\n";
                    db.triples.splice(i, 1);
                    --i;
                }
            }
            var AtomicRule = this;
            Object.keys(this.codes).map(function (k) {
                ret += AtomicRule.codes[k].toResourceShapes(db, prefixes, sePrefix, rsPrefix, depth);
            })
            return ret;
        };
        this.toResourceShapes_inline = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (this.ruleID
                && (this.ruleID._ !== 'BNode'
                    || db.triplesMatching(undefined, undefined, this.ruleID).length !== 0))
                return rsPrefix + ":property " + this.ruleID.toString();
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
                ret += rsPrefix + ":property " + "[\n";
                ret += this.toResourceShapes(db, prefixes, sePrefix, rsPrefix, depth+1);
                ret += lead + "]";
            return ret;
        };
        this.toResourceShapes_standalone = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID
                || (this.ruleID._ === 'BNode'
                    && db.triplesMatching(undefined, undefined, this.ruleID).length === 0))
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            ret += this.toResourceShapes(db, prefixes, sePrefix, rsPrefix, depth);
            ret += ".\n";
            return ret;
        };
        this.toSExpression = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(ArcRule " + this.min + " " + this.max +" "
                + this.nameClass.toSExpression(depth+1) +" "
                + this.valueClass.toSExpression(depth+1)
                + codesToSExpression(this.codes, depth+1) + ")\n";
        };
        this.toHaskell = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(Arcrule " + this.min + " " + this.max +" "
                + this.nameClass.toHaskell(depth+1) +" "
                + this.valueClass.toHaskell(depth+1)
                + codesToHaskell(this.codes, depth+1) + ")\n";
        };
    },

    UnaryRule: function (line, column, rule, opt, codes) {
        this._ = 'UnaryRule'; this.line = line; this.column = column; this.rule = rule; this.opt = opt; this.codes = codes;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) { this.label = label; this.rule.setLabel(label); }
        this.toKey = function () { return this.label.toString() + ' ' + this.toString(); }
        this.toString = function () {
            var ret = "(" + rule.toString() + ")";
            if (this.opt) {
                ret += '?';
            }
            var UnaryRule = this;
            Object.keys(this.codes).map(function (k) { ret += ' %' + k + '{' + UnaryRule.codes[k] + '%}'; })
            return ret;
        };
        this.colorize = function (charmap, idMap) {
            this.rule.colorize(charmap, idMap);
            // var ruleId = "r" + idMap.add(this.toKey());
            // // ugh, toString() in order to get offsets for charmap inserts
            // var ret = "(" + rule.toString(); + ")";
            // if (this.opt) {
            //     ret += '?';
            // }
            // if (this.codes)
            //     Object.keys(this.codes).map(function (k) {
            //         charmap.insertBefore(this.offset, "<span id='"+ruleId+"' class='code'>", ret.length);
            //         ret += ' %' + k + '{' + this.codes[k] + '%}'; 
            //         charmap.insertBefore(this.offset, "</span>", ret.length);
            //     })
        };
        // GroupRule: v=validity(r,p,g,inOpt|opt); if(𝕗|𝜃) return v;
        // if(∅) {if(inOpt) return ∅ else if (opt) return 𝕡 else return 𝕗}; return dispatch('post', );
        this.validate = function (schema, point, inOpt, db) {
            schema.dispatch('enter', this.codes, this, {o:point}); // !! lie! it's the *subject*!
            var v = this.rule.validate(schema, point, inOpt || this.opt, db);
            schema.dispatch('exit', this.codes, this, null);
            if (v.status == RDF.DISPOSITION.FAIL || v.status == RDF.DISPOSITION.INDEFINITE)
                ; // v.status = RDF.DISPOSITION.FAIL; -- avoid dispatch below
            else if (v.status == RDF.DISPOSITION.EMPTY) {
                // if (inOpt) v.status = RDF.DISPOSITION.EMPTY; else
                if (this.opt)
                    v.status = RDF.DISPOSITION.PASS;
                else
                    v.status = RDF.DISPOSITION.FAIL;
            } else if (v.status != RDF.DISPOSITION.FAIL)
                v.status = schema.dispatch('post', this.codes, v, v.matches);
            return v;
        };
        this.SPARQLvalidation = function (schema, label, prefixes, depth, counters, inOpt) {
            var lead = pad(depth, '    ');
        var countSelect = '';
        var counter = undefined;
        if (inOpt) {
            counter = counters.incr(label.lex + "_c");
            countSelect = " (COUNT(*) AS " + counter + ")";
        }
            var ret = this.rule.SPARQLvalidation(schema, label, prefixes, depth+1, counters, this.opt ? true : false);
            ret.prepend(lead + "{\n"); // SELECT ?" + label.lex + countSelect + " {\n"
            ret.append(lead + "}\n"); // GROUP BY ?" + label.lex;
            // ret += SPARQLCardinality(this.opt ? 0 : 1, 1) + "}\n";
            return ret;
        }
        this.SPARQLremainingTriples = function (schema, label, as, prefixes, depth, counters) {
            return this.rule.SPARQLremainingTriples(schema, label, as, prefixes, depth, counters);
        }
        this.toResourceShapes_inline = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (this.ruleID)
                return sePrefix + ":ruleGroup " + this.ruleID.toString();
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += sePrefix + ":ruleGroup " + "[\n";
            ret += lead + ResourceShapeCardinality(this.opt === undefined ? 1 : 0, 1, sePrefix, rsPrefix, seFix, rsFix);
            ret += lead + "    " + this.rule.toResourceShapes_inline(schema, db, prefixes, sePrefix, rsPrefix, depth+1);
            ret += lead + "]";
            return ret;
        };
        this.toResourceShapes_standalone = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID)
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            ret += lead + ResourceShapeCardinality(this.opt === undefined ? 1 : 0, 1, sePrefix, rsPrefix, seFix, rsFix);
            ret += this.rule.toResourceShapes_standalone(schema, db, prefixes, sePrefix, rsPrefix, depth);
            ret += ".\n";
            return ret;
        };
//    UnaryRule: function (line, column, rule, opt, codes) {
        this.toSExpression = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(GroupRule " + (this.opt?":optional":"") +"\n"
                + this.rule.toSExpression(depth+1)
                + codesToSExpression(this.codes, depth+1) + lead + ")\n";
        };
        this.toHaskell = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(GroupRule " + (this.opt?":optional":"") +"\n"
                + this.rule.toHaskell(depth+1)
                + codesToHaskell(this.codes, depth+1) + lead + ")\n";
        };
    },

    IncludeRule: function (line, column, include) {
        this._ = 'IncludeRule'; this.line = line; this.column = column; this.include = include;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) {  }
        this.toKey = function () { return this.label.toString() + ' ' + this.toString(); }
        this.toString = function () {
            return '& ' + this.include.toString();
        };
        this.colorize = function (charmap, idMap) {
            // @@@ hilight include this.rule.colorize(charmap, idMap);
        };
        this.validate = function (schema, point, inOpt, db) {
            return schema.validatePoint(point, this.include, db, false);
        };
        this.SPARQLvalidation = function (schema, label, prefixes, depth, counters, inOpt) {
            return schema.ruleMap[this.include].SPARQLvalidation(schema, label, prefixes, depth, counters, false);
        }
        this.SPARQLremainingTriples = function (schema, label, as, prefixes, depth, counters) {
            return schema.ruleMap[this.include].SPARQLremainingTriples(schema, label, as, prefixes, depth, counters);
        }
        this.toResourceShapes_inline = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            return schema.ruleMap[this.include].toResourceShapes_inline(schema, db, prefixes, sePrefix, rsPrefix, depth);
        };
        this.toResourceShapes_standalone = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            return schema.ruleMap[this.include].toResourceShapes_standalone(schema, db, prefixes, sePrefix, rsPrefix, depth);
        };
//    IncludeRule: function (line, column, include) {
        this.toSExpression = function (depth) {
            var lead = pad(depth, '    ');
            return lead
                + "(IncludeRule "
                + this.parent
                + ")\n";
        };
        this.toHaskell = function (depth) {
            var lead = pad(depth, '    ');
            return lead
                + "(Includerule "
                + this.parent
                + ")\n";
        };
    },

    // Place-holder rule for e.g. empty parent classes.
    EmptyRule: function (line, column) {
        this._ = 'EmptyRule'; this.line = line; this.column = column;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) {  }
        this.toKey = function () { return "@@empty@@"; }
        this.toString = function () {
            return "";
        };
        this.colorize = function (charmap, idMap) {
        };
        this.validate = function (schema, point, inOpt, db) {
            var ret = new RDF.ValRes();
            ret.status = inOpt ? RDF.DISPOSITION.EMPTY : RDF.DISPOSITION.PASS; // nod agreeably
            return ret;
        };
        this.SPARQLvalidation = function (schema, label, prefixes, depth, counters, inOpt) {
            return new RDF.QueryClause(undefined, "");
        }
        this.SPARQLremainingTriples = function (schema, label, as, prefixes, depth, counters) {
            return new RDF.QueryClause(undefined, "");
        }
        this.toResourceShapes_inline = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            return "";
        };
        this.toResourceShapes_standalone = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            return "";
        };
//    EmptyRule: function (line, column) {
        this.toSExpression = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(EmptyRule)";
        };
        this.toHaskell = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "Emptyrule";
        };
    },

    AndRule: function (line, column, conjoints) {
        this._ = 'AndRule'; this.line = line; this.column = column; this.conjoints = conjoints;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) { this.label = label; this.conjoints.map(function (r) { r.setLabel(label); }) ;}
        this.toKey = function () { return this.label.toString() + ' ' + this.toString(); }
        this.toString = function () {
            return this.conjoints.map(function (conj) { return '    ' + conj.toString()}).join(",\n");
        };
        this.colorize = function (charmap, idMap) {
            // var ruleId = "r" + idMap.add(this.toKey());
            for (var i = 0; i < this.conjoints.length; ++i) {
                var conj = this.conjoints[i];
                conj.colorize(charmap, idMap);
            }
        };

        // AndRule: vs=conjoints.map(validity(_,p,g,o)); if(∃𝕗) return 𝕗;
        // if(∃𝕡∧∃∅) return 𝕗; if(∄𝕡∧∄∅) return 𝜃 else if(∃𝕡) return 𝕡 else return ∅
        // Note, this FAILs an empty disjunction.
        this.validate = function (schema, point, inOpt, db) {
            var ret = new RDF.ValRes();
            var seenFail = false;
            var allPass = RDF.DISPOSITION.PASS;
            var passes = [];
            var empties = [];
            for (var i = 0; i < this.conjoints.length; ++i) {
                var conj = this.conjoints[i];
                var r = conj.validate(schema, point, inOpt, db);
                ret.add(r);
                if (r.status == RDF.DISPOSITION.FAIL)
                    seenFail = true;
                if (r.status == RDF.DISPOSITION.PASS)
                    // seenPass = true;
                    passes.push(r);
                else
                    allPass = RDF.DISPOSITION.EMPTY;
                if (r.status == RDF.DISPOSITION.EMPTY)
                    // seenEmpty = true;
                    empties.push(r);
            }
            if (passes.length && empties.length) // 
            { ret.status = RDF.DISPOSITION.FAIL; ret.error_mixedOpt(passes, empties, this); }
            else if (seenFail)
                ret.status = RDF.DISPOSITION.FAIL
            else if (!passes.length && !empties.length)
                ret.status = RDF.DISPOSITION.INDEFINITE;
            else
                ret.status = allPass;
            return ret;
        };
        this.SPARQLvalidation = function (schema, label, prefixes, depth, counters, inOpt) {
            var ret = '';
            var subs = [];
            var firstNonZero = undefined;
            for (var i = 0; i < this.conjoints.length; ++i) {
                var sub = this.conjoints[i].SPARQLvalidation(schema, label, prefixes, depth, counters, inOpt);
                ret += sub.sparql;
                if (inOpt) {
                    subs.push(sub);
                    if (firstNonZero === undefined && sub.min != 0)
                        firstNonZero = i;
                }
            }
            if (inOpt) {
                var empty = subs.map(function (s) {
                    return s.counter + "=0";
                }).join(" && ");
                var nonEmpty = subs.map(function (s) {
                    var r = s.counter + ">=" + s.min;
                    if (s.max !== undefined)
                        r += "&&"+s.counter + "<=" + s.max;
                    return r;
                }).join(" && ");
                ret += pad(depth, '    ') + "FILTER (" + empty + " || " + nonEmpty + ")\n";
            }

            var qc;
            if (inOpt) {
                qc = new RDF.QueryClause(subs[firstNonZero].variable, ret);
                qc.min = subs[firstNonZero].min;
                qc.max = subs[firstNonZero].max
            } else
                qc = new RDF.QueryClause(undefined, ret);
            return qc;
        }
        this.SPARQLremainingTriples = function (schema, label, as, prefixes, depth, counters) {
            var ret = '';
            for (var i = 0; i < this.conjoints.length; ++i) {
                var sub = this.conjoints[i].SPARQLremainingTriples(schema, label, as, prefixes, depth, counters);
                ret += sub.sparql;
                if (i !== this.conjoints.length - 1)
                    ret += " UNION\n";
            }
            return new RDF.QueryClause(undefined, ret);
        }
        this.toResourceShapes_inline = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (this.ruleID)
                return rsPrefix + ":conjoint " + this.ruleID.toString();
            var lead = pad(depth, '    ');
            var ret = '';
            for (var i = 0; i < this.conjoints.length; ++i) {
                if (i > 0)
                    ret += lead;
                ret += this.conjoints[i].toResourceShapes_inline(schema, db, prefixes, sePrefix, rsPrefix, depth) + " ;\n";
            }
            return ret;
        };
        this.toResourceShapes_standalone = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID)
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            for (var i = 0; i < this.conjoints.length; ++i)
                ret += this.conjoints[i].toResourceShapes_standalone(schema, db, prefixes, sePrefix, rsPrefix, depth);
            return ret;
        };
        this.toSExpression = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(AndRule\n"
                + this.conjoints.map(function(conj) {
                    return conj.toSExpression(depth+1); 
                }).join("")
                + lead + ")\n";
        };
        this.toHaskell = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(And\n"
                + this.conjoints.map(function(conj) {
                    return conj.toHaskell(depth+1); 
                }).join("")
                + lead + ")\n";
        };
        this.prepend = function (elts) {
            this.conjoints = elts.concat(this.conjoints);
        }
    },

    OrRule: function (line, column, disjoints) {
        this._ = 'OrRule'; this.line = line; this.column = column; this.disjoints = disjoints;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) { this.label = label; this.disjoints.map(function (r) { r.setLabel(label); }) ;}
        this.toKey = function () { return (this.label ? this.label.toString() + ' ' : '') + this.toString(); }
        this.toString = function () {
            return '(' + this.disjoints.map(function (disj) { return '(' + disj.toString() + ')'}).join("|\n") + ')';
        }
        this.colorize = function (charmap, idMap) {
            // var ruleId = "r" + idMap.add(this.toKey());
            for (var i = 0; i < this.disjoints.length; ++i) {
                var disj = this.disjoints[i];
                disj.colorize(charmap, idMap);
            }
        };
        // ∃!x -> true if there's exactly one x in vs
        // OrRule: vs=disjoints.map(validity(_,p,g,o)); if(∄𝕡∧∄∅∧∄𝜃) return 𝕗;
        // if(∃!𝕡) return 𝕡; if(∃!𝜃) return 𝜃 else return 𝕗;
        this.validate = function (schema, point, inOpt, db) {
            var ret = new RDF.ValRes();
            var allErrors = true;
            var passCount = 0;
            var indefCount = 0;
            var failures = [];
            for (var i = 0; i < this.disjoints.length; ++i) {
                var disj = this.disjoints[i];
                var r = disj.validate(schema, point, inOpt, db);
                if (r.status == RDF.DISPOSITION.FAIL)
                    failures.push(r);
                else {
                    allErrors = false;
                    ret.add(r);
                    if (r.status == RDF.DISPOSITION.PASS)
                        ++passCount;
                    else if (r.status == RDF.DISPOSITION.INDEFINITE)
                        ++indefCount;
                }
            }
            if (allErrors)
                ret.status = RDF.DISPOSITION.FAIL;
            else if (passCount)
                ret.status = RDF.DISPOSITION.PASS
            else if (indefCount)
                ret.status = RDF.DISPOSITION.INDEFINITE
            else 
                ret.status = RDF.DISPOSITION.FAIL;
            if (ret.status === RDF.DISPOSITION.FAIL)
                ret.error_or(failures, this);
            return ret;
        };
        this.SPARQLvalidation = function (schema, label, prefixes, depth, counters, inOpt) {
            var lead1 = pad(depth, '    ');
            var lead2 = pad(depth+1, '    ');
        var countSelect = '';
        var counter = undefined;
        if (inOpt) {
            counter = counters.incr(label.lex + "_c");
            countSelect = " (COUNT(*) AS " + counter + ")";
        }
            var ret = lead1 + "{ SELECT ?" + label.lex + countSelect + " WHERE {\n" + lead2 + "{\n";
            for (var i = 0; i < this.disjoints.length; ++i) {
                if (i != 0)
                    ret += lead2 + "} UNION {\n"
                ret += this.disjoints[i].SPARQLvalidation(schema, label, prefixes, depth+2, counters, inOpt).sparql
            }
            ret += lead2 + "}\n"
                + lead1 + "} GROUP BY ?" + label.lex + " HAVING (COUNT(*) = 1)}\n"; // make sure we pass only one side of the union
            return new RDF.QueryClause(counter, ret);
        };
        this.SPARQLremainingTriples = function (schema, label, as, prefixes, depth, counters) {
            var ret = '';
            for (var i = 0; i < this.disjoints.length; ++i) {
                var sub = this.disjoints[i].SPARQLremainingTriples(schema, label, as, prefixes, depth, counters);
                ret += sub.sparql;
                if (i !== this.disjoints.length - 1)
                    ret += " UNION\n";
            }
            return new RDF.QueryClause(undefined, ret);
        }
        this.toResourceShapes_inline = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (this.ruleID)
                return rsPrefix + ":disjoint " + this.ruleID.toString();
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += rsPrefix + ":choice " + "[\n";
            for (var i = 0; i < this.disjoints.length; ++i) {
                if (i > 0)
                    ret += "\n";
                if (this.disjoints[i]._ === 'AndRule') {
                    ret += "    " + seFix + "ruleGroup [\n";
                    ret += lead + "        " + this.disjoints[i].toResourceShapes_inline(schema, db, prefixes, sePrefix, rsPrefix, depth+2);
                    ret += lead + "    ] ;\n";
                } else
                    ret += lead + "    " + this.disjoints[i].toResourceShapes_inline(schema, db, prefixes, sePrefix, rsPrefix, depth+1) + " ;";
            }
            ret += lead + "]";
            return ret;
        };
        this.toResourceShapes_standalone = function (schema, db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID)
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            for (var i = 0; i < this.disjoints.length; ++i)
                ret += this.disjoints[i].toResourceShapes_standalone(schema, db, prefixes, sePrefix, rsPrefix, depth+1);
            return ret;
        };
        this.toSExpression = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(OrRule\n"
                + this.disjoints.map(function(disj) {
                    return disj.toSExpression(depth+1); 
                }).join("")
                + lead + ")\n";
        };
        this.toHaskell = function (depth) {
            var lead = pad(depth, '    ');
            return lead + "(Or\n"
                + this.disjoints.map(function(disj) {
                    return disj.toHaskell(depth+1); 
                }).join("")
                + lead + ")\n";
        };
    },

    // Example (unsafe) javascript semantic action handler.
    // Can be used like: schema.eventHandlers = {js: RDF.jsHandler};
    jsHandler: {
        _callback: function (code, valRes, context) {
            eval("function action(_) {" + code + "}");
            ret = action(context, { message: function (msg) { RDF.message(msg); } });
            var status = RDF.DISPOSITION.PASS;
            if (ret === false)
            { status = RDF.DISPOSITION.FAIL; valRes.error_badEval(code); }
            return status;
        },
        begin: function (code, valRes, context) { return this._callback(code, valRes, context); },
        post: function (code, valRes, context) { return this._callback(code, valRes, context); }
    },

    // Example XML generator.
    // Can be used like:
    //   schema.eventHandlers = {GenX: RDF.GenXHandler(document.implementation, 
    //                                                 new XMLSerializer())};
    GenXHandler: function (DOMImplementation, XMLSerializer) {
        return {
            _DOMImplementation:DOMImplementation,
            _XMLSerializer:XMLSerializer,
            text: null,
            _stack: [], // {top:el1, bottom:eln} for some path el1/el2/eln
            _doc: null,
            _parse: function (str) {
                var index = 0;
                var name = "unspecifiedTag";
                var ns = "";
                var attr = false;
                var val = function (v) { return v; };
                str = str.trim();
                var m = str.match(/^(?:\[([0-9-]+)\])?(@)?([^ \t]*)(?:[ \t]+(\$|=|!)([^ \t]*)(?:[ \t]+(\$|=|!)([^ \t]*)(?:[ \t]+(\$|=|!)([^ \t]*))?)?)?/);
                if (m === null)
                    throw "\"" + str + "\" is not a valid GenX instruction.";
                if (m[1])
                    index = parseInt(m[1]);
                if (m[2])
                    attr = true;
                var parents = m[3].split('/');
                if (parents) {
                    name = parents.pop();
                    if (name[0] == '@') {
                        attr = true;
                        name = name.substr(1);
                    }
                } else {
                    parents = [];
                    name = m[3];
                }
                for (i = 4; i < m.length; i += 2)
                    if (m[i] == '$') {
                        ns = m[i+1];
                    } else if (m[i] == '=') {
                        var pr = "val = function (v) { return v.substr(";
                        var po = "); }";
                        var m2;
                        if ((m2 = m[i+1].match(/^substr\(([0-9]+)\)$/)))
                            eval(pr + m2[1] + po);
                        else if ((m2 = m[i+1].match(/^substr\(([0-9]+),([0-9]+)\)$/)))
                            eval(pr + m2[1] + ", " + m2[2] + po);
                        else if (m[i+1] == '')
                            eval("val = function (v) { return ''; };");
                        else
                            throw "\"" + m[i+1] + "\" is unsupported";
                    } else if (m[i] == '!' && m[i+1] == 'debugger') {
                        debugger;
                    }
                return { index:index, ns:ns, attr:attr, name:name, parents:parents, val:val };
            },
            _assign: function (now, p, val) {
                var parents = [];
                for (var i = 0; i < p.parents.length; ++i) {
                    var newEl = this._createElement(p.ns, p.parents[i]);
                    parents.push(newEl);
                    now.appendChild(newEl)
                    now = newEl;
                }
                val = p.val(val);
                if (p.attr) {
                    if (p.index > 0)
                        now = now.childNodes[p.index];
                    else if (p.index < 0)
                        now = now.childNodes[now.childNodes.length+p.index];
                    now.setAttribute(p.name, val);
                    return null;
                } else {
                    element = this._createElement(p.ns, p.name);
                    if (val != '')
                        element.appendChild(this._doc.createTextNode(val));
                    if (parents.length) {
                        now.appendChild(element);
                        return {top:parents[0], bottom:element};
                    } else
                        return {top:element, bottom:element};
                }
            },
            _createElement: function (ns, name) {
                var newEl;
                if (this._doc === null) {
                    this._doc = this._DOMImplementation.createDocument
                    (ns, name, undefined);
                    if (ns !== undefined) // unnecessary in chromium. nec in https://github.com/jindw/xmldom
                        this._doc.childNodes[0].setAttribute("xmlns", ns);
                    newEl = this._doc.childNodes[0];
                } else {
                    newEl = this._doc.createElement(name);
                }
                return newEl;
            },
            beginFindTypes: function () {
                var el = this._createElement("http://www.w3.org/2013/ShEx/", "findTypesRoot");
                this._stack.push({top:el, bottom:el});
            },
            endFindTypes: function () {
                var now = this._stack[this._stack.length-1];
                console.dir(this._doc);
                this.text = this._XMLSerializer.serializeToString(this._doc);
            },
            begin: function (code, valRes, context) {
                var p = this._parse(code);
                if (this._stack.length) { // in a findtypes container
                    var now = this._stack[this._stack.length-1];
                    var elements = this._assign(now.bottom, p, '');
                    this._stack.push(elements)
                } else {
                    var el = this._createElement(p.ns, p.name);
                    this._stack.push({top:el, bottom:el});
                }
            },
            end: function (code, valRes, context) {
                var now = this._stack.pop();
                console.dir(this._doc);
                if (this._stack.length) { // in a findtypes container
                    if (context.status == RDF.DISPOSITION.PASS)
                        this._stack[this._stack.length-1].bottom.appendChild(now.top);
                } else {
                    this.text = this._XMLSerializer.serializeToString(this._doc);
                }
            },
            enter: function (code, valRes, context) {
                var now = this._stack[this._stack.length-1];
                var p = this._parse(code);
                if (p.attr) {
                    now.bottom.setAttribute(p.name, context.o.lex);
                } else {
                    var elements = this._assign(now.bottom, p, context.o.lex);
                    this._stack.push(elements)
                }
            },
            exit: function (code, valRes, context) {
                var p = this._parse(code);
                if (p.attr) {
                    // was set on the way in.
                } else {
                    var now = this._stack.pop();
                    if (this._stack.length) {
                        var target = this._stack[this._stack.length-1].bottom;
                        if (p.index)
                            target = target.childNodes[p.index];
                        target.appendChild(now.top);
                    }
                }
            },
            visit: function (code, valRes, context) {
                var now = this._stack[this._stack.length-1];
                var p = this._parse(code);
                var elements = this._assign(now.bottom, p, context.o.lex);
                if (elements)
                    now.bottom.appendChild(elements.bottom);
            }
        };
    },

    // Example JSON generator.
    // Can be used like:
    //   schema.eventHandlers = {GenJ: RDF.GenJHandler()};
    GenJHandler: function () {
        return {
            text: null,
            _stack: [],
            _context: null,
            _doc: null,
            _needId: false,
            _nsToPrefix: null,
            _parse: function (str) {
                var name = "unspecifiedTag";
                var subjId = false;
                str = str.trim();
                var m = str.match(/^([^ @\t]*)?[ \t]*(\@id)?/);
                if (m === null)
                    throw "\"" + str + "\" is not a valid GenJ instruction.";
                name = m[1];
                if (m[2])
                    subjId = true;
                return { subjId:subjId, name:name };
            },
            _getNamespace: function (iri) {
                var slash = iri.lastIndexOf('/');
                var end = iri.lastIndexOf('#');
                if (slash == -1 && end == -1)
                    return 'iri';
                if (slash > end)
                    end = slash;
                var ns = iri.substr(0, end+1);
                var lname = iri.substr(end+1);
                if (ns in this._nsToPrefix) {
                    return this._nsToPrefix[ns]+':'+lname;
                } else {
                    var prefix = 'ns'+Object.keys(this._nsToPrefix).length
                    this._nsToPrefix[ns] = prefix;
                    this._context[prefix] = ns;
                    return prefix+':'+lname;
                }
            },
            _registerPredicate: function (tag, iri, dt) {
                var pname = this._getNamespace(iri);
                if (dt) {
                    this._context[tag] = { '@id': pname, '@type': this._getNamespace(dt) };
                } else {
                    this._context[tag] = pname;
                }
            },
            _assign: function (now, attr, value) {
                if (attr in now) {
                    if (!(now[attr] instanceof Array))
                        now[attr] = [now[attr]];
                    now[attr].push(value);
                } else
                    now[attr] = value;
            },
            begin: function (code, valRes, context) {
                this._stack.splice(0, this._stack.length);
                var p = this._parse(code);
                if (p.subjId)
                    this._needId = true;
                this._context = {};
                this._nsToPrefix = {};
                this._doc = { '@context': this._context };
                this._stack.push(this._doc);
            },
            end: function (code, valRes, context) {
                console.dir(this._doc);
                this.text = JSON.stringify(this._doc);
            },
            enter: function (code, valRes, context) {
                var now = this._stack[this._stack.length-1];
                var p = this._parse(code);
                var element = {};
                this._registerPredicate(p.name, context.p.lex, null);
                this._assign(now, p.name, element);
                if (p.subjId)
                    this._needId = true;
                this._stack.push(element)
            },
            exit: function (code, valRes, context) {
                var now = this._stack.pop();
            },
            visit: function (code, valRes, context) {
                var now = this._stack[this._stack.length-1];
                if (this._needId) {
                    now['@id'] = context.s.lex;
                    this._needId = false;
                }
                var p = this._parse(code);
                this._assign(now, p.name, context.o.lex);
                this._registerPredicate(p.name, context.p.lex,
                                        context.o._ == 'RDFLiteral' && context.o.datatype &&
                                        context.o.datatype.lex != 'http://www.w3.org/2001/XMLSchema#string'
                                        ? context.o.datatype.lex
                                        : null);
            }
        };
    },

    Schema: function (line, column) {
        this._ = 'Schema'; this.line = line; this.column = column;
        this.ruleMap = {};
        this.ruleLabels = [];
        this.startRule = undefined;
        this.eventHandlers = {};
        this.derivedShapes = {}; // Map parent name to array of 1st generation childrens' rules.
        this.isVirtualShape = {};
        this.init = {};

        this.hasDerivedShape = function (parent, child) {
            if (!(parent.toString() in this.derivedShapes))
                this.derivedShapes[parent.toString()] = [];
            this.derivedShapes[parent.toString()].push(child);
        }
        this.markVirtual = function (shape) {
            this.isVirtualShape[shape.label.toString()] = true;
        }
        this.getRuleMapClosure = function (name) {
            var key = name.toString();
            var _Schema = this;
                // @@ inject hierarchy here
                //    this.derivedShapes = {};
                //    this.isVirtualShape = {};

            // Ugly late-binding of names 'cause they're not known when hasDerivedShape is called.
            // probably over-complicated way to concatonate descendents.
            function children (parent) {
                return _Schema.derivedShapes[parent]
                    ? [parent].concat(_Schema.derivedShapes[parent].map(function (el) {
                        return children(el.label.toString());
                    }).reduce(function (a, b) { return [].concat(a, b) } ))
                    : [parent];
            }
            var disjoints = children(key);
            disjoints = disjoints.filter(function (el) {
                return !_Schema.isVirtualShape[el];
            });
            if (disjoints.length === 0)
                throw "no available shape or derived shapes for " + key;
            disjoints = disjoints.map(function (el) {
                return _Schema.ruleMap[el];
            });
            if (disjoints.length === 1)
                return disjoints[0];
            return new RDF.OrRule(this.ruleMap[key].line, this.ruleMap[key].column, disjoints);
        };
        this.serializeRule = function (label) {
            var ret = '';
            var rule = this.ruleMap[label];
            if (rule._ == 'UnaryRule') {
                ret += label + ' {\n' + rule.rule.toString() + '\n}';
                Object.keys(rule.codes).map(function (k) { ret += ' %' + k + '{' + rule.codes[k] + '%}'; })
                ret += "\n\n";
            } else if (rule._ == 'IncludeRule') {
                ret += ": ";
                rule.parents.forEach(function (p) { ret += p.toString(); });
                ret += label + ' {\n' + rule.rule.toString() + '\n}';
                ret += "\n\n";
            } else {
                ret += label + ' {\n' + rule.toString() + '\n}\n\n';
            }
            return ret;
        };
        this.toString = function () {
            var ret = '';

            var Schema = this;
            if (this.init)
                Object.keys(this.init).map(function (k) { ret += Schema.init[k] + "\n"; })
            if (this.startRule)
                ret += "start = " + this.startRule.toString() + "\n\n";
            for (var label in this.ruleMap)
                ret += this.serializeRule(label);
            return ret;
        };
        this.add = function (label, rule) {
            var key = label.toString();
            if (this.ruleMap[key])
                throw "unexpected duplicate rule label: " + key;
            this.ruleLabels.push(label);
            this.ruleMap[key] = rule;
        }
        this.colorize = function (charmap) {
            var idMap = new IntStringMap();
            for (var i = 0; i < this.ruleLabels.length; ++i)
                this.ruleMap[this.ruleLabels[i].toString()].colorize(charmap, idMap);
            // for (var label in this.ruleMap)
            //     this.ruleMap[label].colorize(charmap, idMap);
            return idMap;
        };
        this.termResults = {}; // temp cache hack -- makes schema validation non-reentrant
        this.validatePoint = function (point, as, db, subShapes) {
            // cyclic recursion guard says "am i verifying point as an as in this closure mode?"
            // with closure: start=<a> <a> { <p1> @<a> } / <s1> <p1> <s1> .
            //  w/o closure: start={ <p1> @<a> } VIRTUAL <a> { <p2> (1) } <b> & <a> {  } ! <s1> <p1> [ <p2> 2 ] .
            var key = point.toString() + ' @' + as + "," + subShapes;
            var ret = this.termResults[key];
            if (ret == undefined) {
                this.termResults[key] = new RDF.ValRes(); // temporary empty solution
                this.termResults[key].status = RDF.DISPOSITION.PASS; // matchedEmpty(this.ruleMap[as.toString()]);
                if (subShapes)
                    ret = this.getRuleMapClosure(as).validate(this, point, false, db);
                else
                    ret = this.ruleMap[as.toString()].validate(this, point, false, db);
                this.termResults[key] = ret;
            }
            return ret;
        };

        // usual interface for validating a pointed graph
        this.validate = function (point, db) {
            this.dispatch('begin', this.init, null, null);
            var ret = this.validatePoint(point, this.startRule, db, true);
            this.dispatch('end', this.init, null, null); // this.init isn't actually called.
            return ret;
        };

        // usual interface for finding types in a graph
        this.findTypes = function (db) {
            var ret = new RDF.ValRes(); // accumulate validation successes.
            ret.status = RDF.DISPOSITION.PASS;

            // Get all of the subject nodes.
            // Note that this DB has different objects for each
            // lexical instantiation of an RDF node so we key on
            // the string (N-Triples) representations.
            var subjects = {};
            for (var i = 0; i < db.triples.length; ++i) {
                var t = db.slice(i)[0].s;
                var s = t.toString();
                if (subjects[s] === undefined)
                    subjects[s] = t;
            }

            for (var handler in this.handlers)
                if ('beginFindTypes' in this.handlers[handler])
                    this.handlers[handler]['beginFindTypes']();
            // For each (distinct) subject node s,
            for (var sStr in subjects) {
                var s = subjects[sStr];

                // for each rule label ruleLabel,
                for (var ri = 0; ri < this.ruleLabels.length; ++ri) {
                    var ruleLabel = this.ruleLabels[ri];

                    // if the labeled rule not VIRTUAL,
                    if (!this.isVirtualShape[ruleLabel.toString()]) {

                        // test s against that rule (but not its subshapes).
                        this.dispatch('begin', this.init, null, null);
                        var res = this.validatePoint(s, ruleLabel, db, false);
                        this.dispatch('end', this.init, null, res); // this.init isn't actually called.

                        // If it passed or is indeterminate,
                        if (res.status !== RDF.DISPOSITION.FAIL) {

                            // record the success.
                            message(sStr + " is a " + ruleLabel.toString());
                            var t = new RDF.Triple(s, new RDF.IRI(0,0,0,0,"http://open-services.net/ns/core#instanceShape"), ruleLabel);
                            ret.matchedTree(this.ruleMap[ruleLabel], t, res);
                        }
                    }
                }
            }
            for (var handler in this.handlers)
                if ('endFindTypes' in this.handlers[handler])
                    this.handlers[handler]['endFindTypes']();
            return ret;
        };
        this.dispatch = function (event, codes, valRes, context) {
            var ret = RDF.DISPOSITION.PASS;
            for (var key in codes)
                if (this.handlers[key] && this.handlers[key][event]) {
                    var ex = this.handlers[key][event](codes[key].code, valRes, context);
                    if (ex == RDF.DISPOSITION.FAIL)
                        ret = RDF.DISPOSITION.FAIL;
                }
            return ret;
        };
        this.seen = {};
        this.SPARQLvalidation2 = function (func, prefixes, prepend, append) {
            if (!this.startRule)
                throw "schema needs a startRule";
            var start = this.startRule.toString();
            this.seen = {};
            this.seen[start] = start;
            var counters = {
                state: {},
                incr: function (label) {
                    if (this.state[label] === undefined)
                        this.state[label] = 0;
                    return "?" + label + this.state[label]++;
                }
            };
            try {
                return prepend
                    + func(this.ruleMap[start], this, this.startRule, prefixes, 1, counters, false).sparql
                    + append;
            } catch (e) {
                var m = "failed to generate SPARQL validation query because:\n" + e;
                RDF.message(m);
                return m;
            }
        };
        this.SPARQLvalidation = function (prefixes) {
            return this.SPARQLvalidation2(
                function (rule, schema, label, prefixes, depth, counters, inOpt) {
                    return rule.SPARQLvalidation(schema, label, prefixes, depth, counters, inOpt);
                }, prefixes,
                RDF.SPARQLprefixes(prefixes) + "ASK {\n", "}\n");
        }
        this.SPARQLremainingTriples = function (prefixes) {
            var ret = this.SPARQLvalidation2(
                function (rule, schema, label, prefixes, depth, counters, inOpt) {
                    return rule.SPARQLvalidation(schema, label, prefixes, depth, counters, inOpt);
                }, prefixes,
                RDF.SPARQLprefixes(prefixes) + "\
SELECT ?s ?p ?o {\n\
  { ?s ?p ?o } MINUS\n\
  {\n","    {\n");
            ret += this.SPARQLvalidation2(
                function (rule, schema, label, prefixes, depth, counters, inOpt) {
                    return rule.SPARQLremainingTriples(schema, label, "?"+label.lex, prefixes, depth, counters);
                }, prefixes, "", "");
            ret += "\n\
    }\n\
  }\n\
}\n";
            return ret;
        }
        this.SPARQLvalidation3 = function (label, prefixes, depth, counters) {
            var start = label.toString();
            if (this.seen[start])
                throw new RDF.ValidationRecursion(this.seen[start]);
            if (!this.ruleMap[start])
                throw new RDF.UnknownRule(start);

            this.seen[start] = label;
            return this.ruleMap[start].SPARQLvalidation(this, label, prefixes, depth, counters, false)
        };
        this.SPARQLremainingTriples3 = function (label, as, prefixes, depth, counters) {
            var start = label.toString();
            if (this.seen[start])
                throw new RDF.ValidationRecursion(this.seen[start]);
            if (!this.ruleMap[start])
                throw new RDF.UnknownRule(start);

            this.seen[start] = label;
            return this.ruleMap[start].SPARQLremainingTriples(this, label, as, prefixes, depth, counters)
        };
        this.toResourceShapes = function (prefixes, sePrefix, rsPrefix) {
            var ret = RDF.SPARQLprefixes(prefixes);
            dbCopy = this.db.clone();
            for (var label in this.ruleMap) {
                var rule = this.ruleMap[label];
                ret += label + " a " + rsPrefix + ":ResourceShape ;\n"
                ret += "    " + rule.toResourceShapes_inline(this, dbCopy, prefixes, sePrefix, rsPrefix, 1) + " .\n";
            }
            for (var label in this.ruleMap) {
                var rule = this.ruleMap[label];
                ret += rule.toResourceShapes_standalone(this, dbCopy, prefixes, sePrefix, rsPrefix, 1);
            }
            if (dbCopy.triples.length != 0)
                ret += "# remaining triples:\n" + dbCopy.toString();
            return ret;
        };
        this.toSExpression = function (depth) {
            if (depth === undefined) depth=0;
            var Schema = this;
            return "(Schema\n"
                + Object.keys(this.ruleMap).map(function (k) {
                    return "'(" + k + "\n"
                        + Schema.ruleMap[k].toSExpression(depth+1)
                        +" )\n"
                }).join("")+")";
        };
        this.toHaskell = function (depth) {
            if (depth === undefined) depth=0;
            var Schema = this;
            return "(Schema\n"
                + Object.keys(this.ruleMap).map(function (k) {
                    return "(" + k + "->\n"
                        + Schema.ruleMap[k].toHaskell(depth+1)
                        +" )\n"
                }).join("")+")";
        };
        this.partition = function (includes, looseEnds, needed) {
            looseEnds = typeof looseEnds !== 'undefined' ? looseEnds : {};
            needed = typeof needed !== 'undefined' ? needed : {};
            var uses = {};
            var Schema = this; // this is apparently unavailable in _walk.
            function _walk (rule, parents) {
                function _dive (into) {
                    if (parents.indexOf(into) === -1) {
                        parents.map(function (p) {
                            if (uses[p] === undefined)
                                uses[p] = [];
                            uses[p].push(into);
                        });
                        var next = Schema.ruleMap[into];
                        if (next === undefined) {
                            if (looseEnds[into] === undefined)
                                looseEnds[into] = { p:[] };
                            var p = parents[parents.length-1];
                            if (looseEnds[into][p] === undefined)
                                looseEnds[into][p] = [];
                            looseEnds[into][p].push(rule.toString());
                        } else {
                            parents.push(into);
                            _walk(next, parents);
                            parents.pop();
                        }
                    }
                };
                switch (rule._) {
                case "AtomicRule":
                    if (rule.valueClass._== "ValueReference")
                        _dive(rule.valueClass.label.toString());
                    break;
                case "UnaryRule":
                    _walk(rule.rule, parents);
                    break;
                case "IncludeRule":
                    _dive(rule.include.toString());
                    break;
                case "EmptyRule":
                    break;
                case "AndRule":
                    for (var conj = 0; conj < rule.conjoints.length; ++conj)
                        _walk(rule.conjoints[conj], parents);
                    break;
                case "OrRule":
                    for (var disj = 0; disj < rule.disjoints.length; ++disj)
                        _walk(rule.disjoints[disj], parents);
                    break;
                default: throw "what's a \"" + rule._ + "\"?"
                }
            };
            for (var ri = 0; ri < this.ruleLabels.length; ++ri) {
                var ruleLabel = this.ruleLabels[ri];
                if (!this.isVirtualShape[ruleLabel.toString()])
                    _walk(this.ruleMap[ruleLabel], [ruleLabel]); // this.getRuleMapClosure
            }

            //for (var p in uses) {
            for (var i = 0; i < includes.length; ++i) {
                var p = includes[i];
                needed[p] = true;
                for (var c in uses[p]) needed[uses[p][c]] = true;
            }


            ret = new RDF.Schema(this.line, this.column);
            ret.startRule = this.startRule;
            ret.eventHandlers = this.eventHandlers;
            ret.derivedShapes = {};
            ret.isVirtualShape = {};
            ret.init = this.init;
            for (var ri = 0; ri < this.ruleLabels.length; ++ri) {
                var ruleLabel = this.ruleLabels[ri];
                var ruleLabelStr = ruleLabel.toString();
                if (needed[ruleLabelStr]) {
                    ret.derivedShapes[ruleLabelStr] = this.derivedShapes[ruleLabelStr];
                    if (this.isVirtualShape[ruleLabelStr])
                        ret.isVirtualShape[ruleLabelStr] = true;
                    ret.add(ruleLabel, this.ruleMap[ruleLabelStr]);
                }
            }
            return ret;
        };
    },

    ValRes: function () {
        function renderRule (rule, triple, depth, schemaIdMap, dataIdMap, solutions, classNames) { 
            var sOrdinal = solutions.length;
            var rs = rule.toString();
            var rOrdinal = schemaIdMap.getInt(rule.toKey());
            var tOrdinal = '', ts;
            if (triple) {
                ts = triple.toString();
                tOrdinal = dataIdMap.getInt(ts)
                solutions.push({rule:rOrdinal, triple:tOrdinal});
            } else {
                solutions.push({rule:rOrdinal});
            }

            var ret = pad(depth)
                + "<span id=\"s"+sOrdinal+"\" onClick='hilight(["+sOrdinal+"], ["+rOrdinal+"], ["+tOrdinal+"]);'>";

            ret += "<span class='" + (classNames['schema'] || 'schema') + "'>"
                + rs.replace(/</gm, '&lt;').replace(/>/gm, '&gt;')
                + "</span>"

            if (triple)
                ret += " matched by "
                + "<span class='" + (classNames['data'] || 'data') + "'>"
                + ts.replace(/</gm, '&lt;').replace(/>/gm, '&gt;')
                + "</span>";

            ret += "</span>";
            return ret;
        }
        function renderFailure (rule, triple, depth, schemaIdMap, dataIdMap, solutions, classNames, lead, mid) {
            var sOrdinal = solutions.length;
            var rs = rule.toString();
            var rOrdinal = schemaIdMap.getInt(rule.toKey());

            // Dance akwardly around the non-indexing of non-atomic rules.
            if (rOrdinal !== undefined)
                classNames.addErrorClass("r", [rOrdinal]);
            else
                rOrdinal = '';
            // otherwise would just     classNames.addErrorClass("r", [rOrdinal]);

            // document.getElementById("r"+rOrdinal).classList.add("error");
            var tOrdinal = '', ts;
            if (triple) {
                ts = triple.toString();
                tOrdinal = dataIdMap.getInt(ts)
                classNames.addErrorClass("", dataIdMap.getMembers(tOrdinal));
                // document.getElementById("t"+tOrdinal).classList.add("error");
            }
            var newSolution = {};
            if (rOrdinal !== '') newSolution["rule"] = rOrdinal;
            if (tOrdinal !== '') newSolution["triple"] = tOrdinal;

            var ret = pad(depth)
                + "<span id=\"s"+sOrdinal+"\" onClick='hilight(["+sOrdinal+"], ["+rOrdinal+"], ["+tOrdinal+"]);' class=\"error\">" + lead;

            if (triple)
                ret += "<span class='" + (classNames['data'] || 'data') + "'>"
                + ts.replace(/</gm, '&lt;').replace(/>/gm, '&gt;')
                + "</span>";

            ret += mid
                + "<span class='" + (classNames['schema'] || 'schema') + "'>"
                + rs.replace(/</gm, '&lt;').replace(/>/gm, '&gt;')
                + "</span>"

            ret += "</span>";
            return ret;
        }
        RuleMatch = function (rule, triple) {
            this._ = 'RuleMatch'; this.status = RDF.DISPOSITION.PASS; this.rule = rule; this.triple = triple;
            this.toString = function (depth) {
                return pad(depth) + this.rule.toString() + " matched by "
                    + this.triple.toString();
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return renderRule(this.rule, this.triple, depth, schemaIdMap, dataIdMap, solutions, classNames);
            };
            this.triples = function () {
                return [this.triple];
            }
        },
        RuleMatchTree = function (rule, triple, r) {
            this._ = 'RuleMatchTree'; this.status = RDF.DISPOSITION.PASS; this.rule = rule; this.triple = triple; this.r = r;
            this.toString = function (depth) {
                return pad(depth) + this.rule.toString() + " matched by "
                    + this.triple.toString() + "\n" + r.toString(depth+1);
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return renderRule(this.rule, this.triple, depth, schemaIdMap, dataIdMap, solutions, classNames)
                    + "\n" + this.r.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames);
            };
            this.triples = function () {
                var ret = this.r.triples();
                ret.unshift(this.triple);
                return ret;
            }
        },
        RuleMatchEmpty = function (rule) {
            this._ = 'RuleMatchEmpty'; this.status = RDF.DISPOSITION.PASS; this.rule = rule;
            this.toString = function (depth) {
                return pad(depth) + this.rule.toString() + " permitted to not match";
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return pad(depth) + renderRule(this.rule, undefined, depth, schemaIdMap, dataIdMap, solutions, classNames) + " permitted to not match";
            };
            this.triples = function () {
                return [];
            }
        },
        this._ = 'ValRes'; this.matches = new Array(); this.errors = new Array(), this.tripleToRules = {};
        this.triples = function () {
            var ret = [];
            if (this.status != RDF.DISPOSITION.FAIL)
                for (var i = 0; i < this.matches.length; ++i)
                    if (this.matches[i].status == RDF.DISPOSITION.PASS)
                        ret = ret.concat(this.matches[i].triples());
            return ret;
        }

        this.tripleToRule = function (triple, rm) {
            var key = triple.toString();
            if (!this.tripleToRules[key])
                this.tripleToRules[key] = [];
            this.tripleToRules[key].push(rm);
        },
        this.copyMatchedTriples = function (from) {
            for (var key in from.tripleToRules) {
                if (!this.tripleToRules[key])
                    this.tripleToRules[key] = [];
                for (var i in from.tripleToRules[key])
                    this.tripleToRules[key].push(from.tripleToRules[key]);
            }
        }
        this.seen = function (triple) {
            var key = triple.toString();
            return !!this.tripleToRules[key];
        },
        this.matched = function (rule, triple) {
            var ret = new RuleMatch(rule, triple);
            this.matches.push(ret);
            this.tripleToRule(triple, ret);
            return ret;
        },
        this.matchedTree = function (rule, triple, r) {
            var ret = new RuleMatchTree(rule, triple, r);
            this.matches.push(ret);
            this.tripleToRule(triple, ret);
            this.copyMatchedTriples(r);
            return ret;
        },
        this.matchedEmpty = function (rule) {
            var ret = new RuleMatchEmpty(rule);
            this.matches.push(ret);
            return ret;
        },

        RuleFail = function (rule, triple) {
            this._ = 'RuleFail'; this.status = RDF.DISPOSITION.FAIL; this.rule = rule; this.triple = triple;
            this.toString = function (depth) {
                return pad(depth) + "expected " + this.triple.toString()
                    + " to match " + this.rule.toString();
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return renderFailure(this.rule, this.triple, depth, schemaIdMap, dataIdMap, solutions, classNames, "expected ", " to match ");
            }
        },
        this.error_noMatch = function (rule, triple)  {
            this.errors.push(new RuleFail(rule, triple));
        },
        RuleFailTree = function (rule, triple, r) {
            this._ = 'RuleFailTree'; this.status = RDF.DISPOSITION.FAIL; this.rule = rule; this.triple = triple; this.r = r;
            this.toString = function (depth) {
                return pad(depth) + "expected " + this.triple.toString()
                    + " to match " + this.rule.toString()
                    + "\n" + r.toString(depth+1);
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return renderFailure(this.rule, this.triple, depth, schemaIdMap, dataIdMap, solutions, classNames, "expected ", " to match ")
                    + "\n" + this.r.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames);
            }
        },
        this.error_noMatchTree = function (rule, triple, r)  {
            this.errors.push(new RuleFailTree(rule, triple, r));
        },
        RuleFailValue = function (rule, triple) {
            this._ = 'RuleFailValue'; this.status = RDF.DISPOSITION.FAIL; this.rule = rule; this.triple = triple;
            this.toString = function (depth) {
                return pad(depth) + "expected object of " + this.triple.toString()
                    + " to match value of " + this.rule.toString();
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return renderFailure(this.rule, this.triple, depth, schemaIdMap, dataIdMap, solutions, classNames, "expected object of ", " to match value of ");
            }
        },
        this.error_wrongValue = function (rule, triple)  {
            this.errors.push(new RuleFailValue(rule, triple));
        },
        RuleFailEval = function (codeObj, solution) {
            this._ = 'RuleFailEval'; this.codeObj = codeObj; this.solution = solution;
            this.toString = function (depth) {
                return pad(depth) + "eval of {" + this.codeObj + "} rejected [[\n"
                    + solution.matches.map(function (m) {
                        return m.toString(depth+1)+"\n";
                    }).join("") + "    ]]";
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                var sOrdinal = solutions.length;
                solutions.push({}); // @@ needed?

                var ret = pad(depth)
                    + "<span id=\"s"+sOrdinal+"\" onClick='hilight(["+sOrdinal+"], [], []);' class=\"error\">"
                    + "eval of {" + this.codeObj + "} rejected [[\n"
                    + solution.matches.map(function (m) {
                        return m.toString(2).replace(/</gm, '&lt;').replace(/>/gm, '&gt;')+"\n";
                    }).join("") + "    ]]"
                    + "</span>";
                return ret;
            }
        },
        this.error_badEval = function (codeObj)  {
            this.errors.push(new RuleFailEval(codeObj, this));
        },
        RuleFailMax = function (max, rule, triple) {
            this._ = 'RuleFailMax'; this.max = max; this.status = RDF.DISPOSITION.FAIL; this.rule = rule; this.triple = triple;
            this.toString = function (depth) {
                return pad(depth) + this.triple.toString()
                    + " exceeds max cardinality " + this.max
                    + " of " + this.rule.toString();
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return renderFailure(this.rule, this.triple, depth, schemaIdMap, dataIdMap, solutions, classNames, "", " exceeds max cardinality " + this.max + " of ");
            }
        },
        this.error_aboveMax = function (max, rule, triple)  {
            this.errors.push(new RuleFailMax(max, rule, triple));
        },
        RuleFailMin = function (min, rule) {
            this._ = 'RuleFailMin'; this.min = min; this.status = RDF.DISPOSITION.FAIL; this.rule = rule;
            this.toString = function (depth) {
                return pad(depth) + "expected at least " + this.min
                    + " matches of " + this.rule.toString();
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return pad(depth) + renderFailure(this.rule, undefined, depth, schemaIdMap, dataIdMap, solutions, classNames, "expected at least " + this.min + " matches of ", "");
            }
        },
        this.error_belowMin = function (min, rule) {
            this.errors.push(new RuleFailMin(min, rule));
        },
        RuleFailOr = function (failures, rule) {
            this._ = 'RuleFailOr'; this.failures = failures; this.status = RDF.DISPOSITION.FAIL; this.rule = rule;
            this.toString = function (depth) {
                return pad(depth) + "no matches of " + this.rule.toString()
                    + "[[" + this.failures.map(function (f) {
                        return pad(depth+1) + f.toString(depth+1);
                    }).join("\n|  ") + "]]";
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return pad(depth) + renderFailure(this.rule, undefined, depth, schemaIdMap, dataIdMap, solutions, classNames, "no matches of ", "")
                    + "[[" + this.failures.map(function (f) {
                        return pad(depth+1) + f.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames);
                    }).join("\n|  ") + "]]";
            }
        },
        this.error_or = function (failures, rule) {
            this.errors.push(new RuleFailOr(failures, rule));
        },

        RuleFailMixedOpt = function (passes, empties, rule) {
            this._ = 'RuleFailMixedOpt'; this.passes = passes; this.empties = empties; this.status = RDF.DISPOSITION.FAIL; this.rule = rule;
            this.toString = function (depth) {
                return pad(depth) + "mixed matches of " + this.rule.toString() + "\n"
                    + "passed: [[" + this.passes.map(function (f) {
                        return pad(depth+1) + f.toString(depth+1);
                    }).join("\n|  ") + "]]\n"
                    + "empty: [[" + this.empties.map(function (f) {
                        return pad(depth+1) + f.toString(depth+1);
                    }).join("\n|  ") + "]]";
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
                return pad(depth) + renderFailure(this.rule, undefined, depth, schemaIdMap, dataIdMap, solutions, classNames, "mixed matches of ", "\n")
                    + "passed: [[" + this.passes.map(function (f) {
                        return pad(depth+1) + f.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames);
                    }).join("\n|  ") + "]]\n"
                    + "empty: [[" + this.empties.map(function (f) {
                        return pad(depth+1) + f.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames);
                    }).join("\n|  ") + "]]";
            }
        },
        this.error_mixedOpt = function (passes, empties, rule) {
            this.errors.push(new RuleFailMixedOpt(passes, empties, rule));
        },

        this.add = function (res) {
            for (var i = 0; i < res.matches.length; ++i)
                this.matches.push(res.matches[i]);
            for (var i = 0; i < res.errors.length; ++i)
                this.errors.push(res.errors[i]);
            if (res.status == RDF.DISPOSITION.FAIL)
                this.copyMatchedTriples(res);
        },
        this.passed = function () {
            return this.status == RDF.DISPOSITION.PASS;
            return this.matches.length > 0 && this.errors.length == 0;
        },
        this.toString = function (depth) {
            var p = pad(depth);
            var ret = p + (this.passed() ? "PASS {\n" : "FAIL {\n");
            if (this.errors.length > 0)
                ret += "Errors:\n" + this.errors.map(function (e) { return ' ☹ ' + p + e.toString(depth+1) + "\n"; }).join("") + "Matches:\n";
            ret += this.matches.map(function (m) { return m.toString(depth+1); }).join("\n");
            return ret + "\n" + p + "}";
        },
        this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
            var p = pad(depth);
            var ret = p + (this.passed() ? "PASS {\n" : "<span class='error'>FAIL</span> {\n");
            if (this.errors.length > 0)
                ret += "Errors:\n" + this.errors.map(function (e) { return ' ☹ ' + p + e.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames) + "\n"; }).join("") + "Matches:\n";
            ret += this.matches.map(function (m) { return m.toHTML(depth+1, schemaIdMap, dataIdMap, solutions, classNames); }).join("\n");
            return ret + "\n" + p + "}";
        }
    },

//    curSchema: new this.Schema()
};
