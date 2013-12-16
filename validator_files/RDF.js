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

RDF = {
    config: {
        UniqueShapePredicates: false
    },

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

    // Util
    Base: '',
    setBase: function (base) {
        this.Base = base;
    },

    getAbsoluteIRI: function (url) {
        if (url.indexOf('//') > 0 || this.Base == undefined)
            return url;
        return this.Base.substr(0, this.Base.lastIndexOf('/')) + url;
        var doc      = document,
        old_base = doc.getElementsByTagName('base')[0],
        old_href = old_base && old_base.href,
        doc_head = doc.head || doc.getElementsByTagName('head')[0],
        our_base = old_base || doc_head.appendChild(doc.createElement('base')),
        resolver = doc.createElement('a'),
        resolved_url;
        our_base.href = Base;
        resolver.href = url;
        resolved_url  = resolver.href; // browser magic at work here
        if (old_base) old_base.href = old_href;
        else doc_head.removeChild(our_base);
        return resolved_url;
    },

    Prefixes: {},
    addPrefix: function (pre, i) {
        this.Prefixes[pre] = i;
    },

    getPrefix: function (pre) {
        // unescapeReserved
        var nspace = this.Prefixes[pre];
        if (nspace == undefined) {
            this.message("unknown namespace prefix: " + pre);
            nspace = '<!' + pre + '!>'
        }
        return nspace;
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
                ret += '@' + this.langtag;
            if (this.datatype != undefined)
                ret += '^^' + this.datatype.toString();
            return ret;
        };
        this.assignId = function (charmap, id) {
            if (this.id === undefined) {
                this.id = id;
                if (this.datatype != undefined)
                    this.datatype.assignId(charmap, id);
//            if (this.langtag != undefined)
//                ret += '@' + this.langtag;
                charmap.insertBefore(this.offset, "<span id='"+id+"' class='literal'>", 0);
                charmap.insertAfter(this.offset+this.width, "</span>", 0);
            }
            return this.id;
        };
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
        return new RDF.BNode(line, column, offset, width, ''+this.NextBNode++);
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
        };
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
    },
    NameAny: function (line, column, exclusions) {
        this._ = 'NameAny'; this.line = line; this.column = column; this.exclusions = exclusions;
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
                throw "expressing NameAny with exclusions " + this.toString() + " will require some fancy POWDER.";
            return '';
        }
        this.toSExpression = function (depth) {
            return "(NameAny "+(this.exclusions.map(function(ex){return ex.toString();}).join(' '))+")";
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

    ValueReference: function (line, column, offset, width, label) {
        this._ = 'ValueReference'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.label = label;
        this.toString = function () {
            return '@' + this.label.toString();
        },
        this.validate = function (schema, rule, t, db) {
            var ret = new RDF.ValRes();
            var r = schema.validate(t.o, this.label, db);
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
    },
    ValueType: function (line, column, offset, width, type) {
        this._ = 'ValueType'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.type = type;
        this.toString = function () {
            return this.type.toString();
        },
        this.validate = function (schema, rule, t, db) {
            var ret = new RDF.ValRes();
            if (this.type.toString() == "<http://www.w3.org/2001/XMLSchema#string>")
                if (t.o._ == "RDFLiteral")    { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
                else                          { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
            else if (this.type.toString() == "<http://www.w3.org/1999/02/22-rdf-syntax-ns#Resource>")
                if (t.o._ == "IRI")           { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
                else                          { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
            else if (t.o._ == "RDFLiteral" && t.o.datatype != undefined
                     && t.o.datatype.toString() == this.type.toString())
                { ret.status = RDF.DISPOSITION.PASS; ret.matched(rule, t); }
            else
            { ret.status = RDF.DISPOSITION.FAIL; ret.error_noMatch(rule, t); }
            return ret;
        },
        this.SPARQLobject = function (prefixes) {
            return "?o";
        },
        this.SPARQLobjectTest = function (prefixes) {
            var s = this.type.toString();
            if (s == "<http://www.w3.org/2001/XMLSchema#string>") return "isLiteral(?o)";
            if (s == "<http://www.w3.org/1999/02/22-rdf-syntax-ns#Resource>") return "(isIRI(?o) || isBlank(?o))";
            return "datatype(?o) = " + defix(this.type, prefixes);
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
    },
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
    },
    ValueAny: function (line, column, offset, width, exclusions) {
        this._ = 'ValueAny'; this.line = line; this.column = column; this.offset = offset; this.width = width; this.exclusions = exclusions;
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
            return "# haven't made up some schema for ValueAny yet.\n";
        }
        this.toSExpression = function (depth) {
            return "(ValueAny "+(this.exclusions.map(function(ex){return ex.toString();}).join(' '))+")";
        }
    },
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
        // vs=matchName.map(valueClass(v,_,g,false)); if(∃𝕗) return 𝕗; return dispatch(𝕡);
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
                { ret.status = RDF.DISPOSITION.FAIL; ret.error_aboveMax(this.max, this.max, matchName[this.max]); }
            else {
                for (var i = 0; i < matchName.length; ++i) {
                    var t = matchName[i];
                    var r = this.valueClass.validate(schema, this, t, db);
                    if (!r.passed()) {
                        ret.status = RDF.DISPOSITION.FAIL;
                        ret.add(r);
                    } else {
                        if (schema.dispatch(this.codes, r, t) == RDF.DISPOSITION.FAIL)
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
        this.toResourceShapes_inline = function (db, prefixes, sePrefix, rsPrefix, depth) {
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
        this.toResourceShapes_standalone = function (db, prefixes, sePrefix, rsPrefix, depth) {
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
    },

    UnaryRule: function (line, column, rule, opt, codes) {
        this._ = 'UnaryRule'; this.line = line; this.column = column; this.rule = rule; this.opt = opt; this.codes = codes;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) { this.label = label; rule.setLabel(label); }
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
        // if(∅) {if(inOpt) return ∅ else if (opt) return 𝕡 else return 𝕗}; return dispatch();
        this.validate = function (schema, point, inOpt, db) {
            var v = this.rule.validate(schema, point, inOpt || this.opt, db);
            if (v.status == RDF.DISPOSITION.FAIL || v.status == RDF.DISPOSITION.INDEFINITE)
                ; // v.status = RDF.DISPOSITION.FAIL; -- avoid dispatch below
            else if (v.status == RDF.DISPOSITION.EMPTY) {
                // if (inOpt) v.status = RDF.DISPOSITION.EMPTY; else
                if (this.opt)
                    v.status = RDF.DISPOSITION.PASS;
                else
                    v.status = RDF.DISPOSITION.FAIL;
            } else if (v.status != RDF.DISPOSITION.FAIL)
                v.status = schema.dispatch(this.codes, v, v.matches);
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
        this.toResourceShapes_inline = function (db, prefixes, sePrefix, rsPrefix, depth) {
            if (this.ruleID)
                return sePrefix + ":ruleGroup " + this.ruleID.toString();
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += sePrefix + ":ruleGroup " + "[\n";
            ret += lead + ResourceShapeCardinality(this.opt === undefined ? 1 : 0, 1, sePrefix, rsPrefix, seFix, rsFix);
            ret += lead + "    " + this.rule.toResourceShapes_inline(db, prefixes, sePrefix, rsPrefix, depth+1);
            ret += lead + "]";
            return ret;
        };
        this.toResourceShapes_standalone = function (db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID)
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            ret += lead + ResourceShapeCardinality(this.opt === undefined ? 1 : 0, 1, sePrefix, rsPrefix, seFix, rsFix);
            ret += this.rule.toResourceShapes_standalone(db, prefixes, sePrefix, rsPrefix, depth);
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
            if (seenFail || passes.length && empties.length)
            { ret.status = RDF.DISPOSITION.FAIL; ret.error_mixedOpt(passes, empties, this); }
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
        this.toResourceShapes_inline = function (db, prefixes, sePrefix, rsPrefix, depth) {
            if (this.ruleID)
                return rsPrefix + ":conjoint " + this.ruleID.toString();
            var lead = pad(depth, '    ');
            var ret = '';
            for (var i = 0; i < this.conjoints.length; ++i) {
                if (i > 0)
                    ret += lead;
                ret += this.conjoints[i].toResourceShapes_inline(db, prefixes, sePrefix, rsPrefix, depth) + " ;\n";
            }
            return ret;
        };
        this.toResourceShapes_standalone = function (db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID)
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            for (var i = 0; i < this.conjoints.length; ++i)
                ret += this.conjoints[i].toResourceShapes_standalone(db, prefixes, sePrefix, rsPrefix, depth);
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
    },

    OrRule: function (line, column, disjoints) {
        this._ = 'OrRule'; this.line = line; this.column = column; this.disjoints = disjoints;
        this.ruleID = undefined;
        this.setRuleID = function (ruleID) { this.ruleID = ruleID; }
        this.label = undefined;
        this.setLabel = function (label) { this.label = label; this.disjoints.map(function (r) { r.setLabel(label); }) ;}
        this.toKey = function () { return this.label.toString() + ' ' + this.toString(); }
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
        this.toResourceShapes_inline = function (db, prefixes, sePrefix, rsPrefix, depth) {
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
                    ret += lead + "        " + this.disjoints[i].toResourceShapes_inline(db, prefixes, sePrefix, rsPrefix, depth+2);
                    ret += lead + "    ] ;\n";
                } else
                    ret += lead + "    " + this.disjoints[i].toResourceShapes_inline(db, prefixes, sePrefix, rsPrefix, depth+1) + " ;";
            }
            ret += lead + "]";
            return ret;
        };
        this.toResourceShapes_standalone = function (db, prefixes, sePrefix, rsPrefix, depth) {
            if (!this.ruleID)
                return '';
            var lead = pad(depth, '    ');
            var seFix = lead + sePrefix + ":";
            var rsFix = lead + rsPrefix + ":";
            var ret = '';
            ret += this.ruleID.toString() + "\n";
            for (var i = 0; i < this.disjoints.length; ++i)
                ret += this.disjoints[i].toResourceShapes_standalone(db, prefixes, sePrefix, rsPrefix, depth+1);
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
    },

    Schema: function (line, column) {
        this._ = 'Schema'; this.line = line; this.column = column; this.ruleMap = {}; this.ruleLabels = []; this.startRule = undefined; this.disableJavascript = false;
        this.termResults = {};
        this.toString = function () {
            var ret = '';
            if (this.startRule)
                ret += "start = " + this.startRule.toString() + "\n\n";
            for (var label in this.ruleMap) {
                var rule = this.ruleMap[label];
                if (rule._ == 'UnaryRule') {
                    ret += label + ' {\n' + rule.rule.toString() + '\n}';
                    Object.keys(rule.codes).map(function (k) { ret += ' %' + k + '{' + rule.codes[k] + '%}'; })
                    ret += "\n\n";
                } else {
                    ret += label + ' {\n' + rule.toString() + '\n}\n\n';
                }
            }
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
        this.validate = function (point, as, db) {
            if (point) {
                var key = point.toString() + ' @' + as;
                var ret = this.termResults[key];
                if (ret == undefined) {
                    ret = this.ruleMap[as.toString()].validate(this, point, false, db);
                    this.termResults[key] = ret;
                }
                return ret;
            } else {
                var ret = new RDF.ValRes();
                ret.status = RDF.DISPOSITION.PASS;

                // Get all of the subject nodes.
                var subjects = [];
                for (var i = 0; i < db.triples.length; ++i) {
                    var t = db.slice(i)[0].s;
                    if (subjects.indexOf(t) == -1)
                        subjects.push(t);
                }

                // Walk through subjects and rules
                for (var si = 0; si < subjects.length; ++si) {
                    var s = subjects[si];
                    for (var ri = 0; ri < this.ruleLabels.length; ++ri) {
                        var rule = this.ruleLabels[ri];
                        var res = this.validate(s, rule, db);
                        if (res.status !== RDF.DISPOSITION.FAIL) {
                            message(s.toString() + " is a " + rule.toString());
                            // ret.add(res);
                            var t = new RDF.Triple(s, new RDF.IRI(0,0,0,0,"http://open-services.net/ns/core#instanceShape"), rule);
                            ret.matchedTree(this.ruleMap[rule], t, res);
                        }
                    }
                }
                return ret;
            }
        };
        this.dispatch = function (codes, valRes, context) {
            for (var key in this.codes) { // Use each to access codes.js 'cause i don't want
                if (key == "js" && !this.disableJavascript) {        // to leave behind a codes.js = undefined artifact.
                    eval("function action(_) {" + this.codes[key].code + "}");
                    ret = action(context);
                    var status = RDF.DISPOSITION.PASS;
                    if (ret === false)
                        { status = RDF.DISPOSITION.FAIL; valRes.error_badEval(codes[key]); }
                    return status;
                }
            }
            return RDF.DISPOSITION.PASS;
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
                ret += "    " + rule.toResourceShapes_inline(dbCopy, prefixes, sePrefix, rsPrefix, 1) + " .\n";
            }
            for (var label in this.ruleMap) {
                var rule = this.ruleMap[label];
                ret += rule.toResourceShapes_standalone(dbCopy, prefixes, sePrefix, rsPrefix, 1);
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
                return pad(depth) + "eval of {" + codeObj.code + "} rejected [[\n"
                    + solution.matches.map(function (m) {
                        return m.toString(depth+1)+"\n";
                    }).join("") + "    ]]";
            };
            this.toHTML = function (depth, schemaIdMap, dataIdMap, solutions, classNames) {
            var sOrdinal = solutions.length;
            solutions.push({}); // @@ needed?

            var ret = pad(depth)
                + "<span id=\"s"+sOrdinal+"\" onClick='hilight(["+sOrdinal+"], [], []);' class=\"error\">"
                + "eval of {" + codeObj.code + "} rejected [[\n"
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
    }
//    curSchema: new this.Schema()
};
