window.message = function (msg) {
    output.textContent += "Message: " + msg + "\n";
}
window.Hmessage = function (msg) {
    output.innerHTML += "Message: " + msg + "\n";
}
RDF.message = function (msg) {
    window.Hmessage(msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

var cache = new Array();
function writeit (element, path) {
    if (!!cache[path]) {
        // console.log('cache hit');
        element.textContent = cache[path];
        return;
    }
    
    var xhr = new XMLHttpRequest();
    
    xhr.onreadystatechange = function () {
        if (this.readyState == 4
            && this.status == 200) {    
            element.textContent = cache[path] = this.responseText;
            // console.log('GET ' + path + ': ' + this.responseText);
        }
    };
    try {
        xhr.open('GET', path, true);
        xhr.send(null);
    } catch (e) {
        element.textContent = e;
    }
}

var FOCUS = {
    SCHEMA :    {value: 0, name: "ShEx"   }, 
    DATA:       {value: 1, name: "Turtle" }, 
    SOLUTIONS : {value: 2, name: "Results"}
};

            function removeClass (type, list, className) {
                if (list === undefined) return;
                for (var i = 0; i < list.length; ++i)
                    document.getElementById(type + list[i]).classList.remove(className);
            }
            function addClass (type, list, className) {
                if (list === undefined) return;
                for (var i = 0; i < list.length; ++i)
                    document.getElementById(type + list[i]).classList.add(className);
            }

    function sanitizeEditable (element) {
        element.innerHTML = element.innerHTML
            .replace(/<div>/g, "\n").replace(/<\/div>/g, "") // chromium
            .replace(/<br>/g, "\n")                          // firefox
            .replace(/&nbsp;/g, " ")                         // nbsps in pirate pad
                                                             // ...?
        ;
    }

    function parse (id, parse, start) {
        var ret = {};
        var element = document.getElementById(id);
        sanitizeEditable(element);
        var text = element.textContent; // was innerText
	try {
            ret.obj = parse(text, start);
            var textMap = new CharMap(text);
            textMap.HTMLescape();
            ret.idMap = ret.obj.colorize(textMap)
            element.innerHTML = textMap.text;
            return ret;
	} catch (e) {
	    function buildErrorMessage(e) {
		return e.line !== undefined && e.column !== undefined
		    ? "Line " + e.line + ", column " + e.column + ": " + e.message
		    : e.message;
	    }

            output.textContent += id + " error: " + buildErrorMessage(e);
	    throw '';
	}
    }

var schema = undefined;
var data = undefined;
    
function validate () {
    // Tweak the HTML guts of a contenteditable=true to get rid of the bizarre
    // HTML markup added in:
    var output = document.getElementById("output");

    try {
        window.message("parsing schema...");
        schema = parse("schemaText", ShExParser.parse, "ShExDoc");

        window.message("parsing data...");
        data = parse("turtleText", TurtleParser.parse, "turtleDoc");

        window.message("validating data staring with " + data.obj.slice(0,1)[0].s + " ...");
        var validationResult = schema.obj.validate(data.obj.slice(0,1)[0].s, schema.obj.startRule, data.obj);
        var solutions = [];
        output.innerHTML += validationResult.toHTML(0, schema.idMap, data.idMap, solutions,
						    { schema: 'schema', data: 'data',
						      addErrorClass: function(type, list) {
							  addClass(type, list, "error");
						      }}) + "\n";

        var lastRule = [], lastTriple = [], lastSolution = [], rules = [], triples = [];

        // Populate rules and triples vectors from the solutions.
        for (var s = 0; s < solutions.length; ++s) {
            // t or r may be undefined as some solutions don't include them.
            var t = solutions[s].triple;
            var r = solutions[s].rule;
            if (t !== undefined) {
                if (!triples[t]) triples[t] = {rules:[], solutions:[]};
                if (r !== undefined) triples[t].rules.push(r);
                triples[t].solutions.push(s);
            }
            if (r !== undefined) {
                if (!rules[r]) rules[r] = {triples:[], solutions:[]};
                if (t !== undefined) rules[r].triples.push(t);
                rules[r].solutions.push(s);
            }
        }
        // Populate rules and triples vectors from the solutions.
        for (var t = 0; t < triples.length; ++t)
            if (!triples[t]) triples[t] = {rules:[], solutions:[]};
        for (var r = 0; r < rules.length; ++r)
            if (!rules[r]) rules[r] = {triples:[], solutions:[]};


        hilight = function (solutionList, schemaList, dataList) {
            function sameElements (left, right) {
                if (left === undefined) return right === undefined ? true : false;
                if (right === undefined) return false;
                if (left.length != right.length) return false;
                for (var i = 0; i < left.length; ++i)
                    if (left[i] !== right[i])
                        return false;
                return true;
            }

            // Turn off current highlighting.
            removeClass("s", lastSolution, "hilightSolution");
            removeClass("r", lastRule, "hilightRule");
            for (var i = 0; i < lastTriple.length; ++i)
                removeClass("", data.idMap.getMembers(lastTriple[i]), "hilightData");

            if (sameElements(lastRule, schemaList) &&
                sameElements(lastTriple, dataList) &&
                sameElements(lastSolution, solutionList)) {

                // User has disabled highlighting.
                lastRule = [];
                lastTriple = [];
                lastSolution = [];
            } else {

                // Update registers with current highlights.
                if (solutionList.length)
                    document.getElementById("curSolution").value = solutionList[solutionList.length-1];
                if (schemaList.length)
                    document.getElementById("curRule").value = schemaList[schemaList.length-1];
                if (dataList.length)
                    document.getElementById("curData").value = dataList[dataList.length-1];

                // Highlight the indicated solution, rule and data elements.
                addClass("s", solutionList, "hilightSolution");
                addClass("r", schemaList, "hilightRule");
                for (var i = 0; i < dataList.length; ++i)
                    addClass("", data.idMap.getMembers(dataList[i]), "hilightData");

                // Write down current state.
                lastRule = schemaList;
                lastTriple = dataList;
                lastSolution = solutionList;
            }
        };

        function down () {
            if (Focus == FOCUS.SOLUTIONS) {
                var i = document.getElementById("curSolution").value;
                if (++i < solutions.length)
                    window.hilight([i], solutions[i].rule === undefined ? [] : [solutions[i].rule], solutions[i].triple === undefined ? [] : [solutions[i].triple]);
            } else if (Focus == FOCUS.SCHEMA) {
                var i = document.getElementById("curRule").value;
                if (++i < rules.length)
                    window.hilight(rules[i].solutions, [i], rules[i].triples);
            } else if (Focus == FOCUS.DATA) {
                var i = document.getElementById("curData").value;
                if (++i < triples.length)
                    window.hilight(triples[i].solutions, triples[i].rules, [i]);
            } else alert(Focus.name);
        }
        // function goTo () {
        //     var s = document.getElementById("curSolution").value;
        //     if (s < 0 || s > solutions.length-1)
        //         s = 0;
        //     document.getElementById("curSolution").value = s;
        //     window.hilight([s], [solutions[s].rule], [solutions[s].triple]);
        // }
        function up () {
            if (Focus == FOCUS.SOLUTIONS) {
                var i = document.getElementById("curSolution").value;
                if (--i >= 0)
                    window.hilight([i], solutions[i].rule === undefined ? [] : [solutions[i].rule], solutions[i].triple === undefined ? [] : [solutions[i].triple]);
            } else if (Focus == FOCUS.SCHEMA) {
                var i = document.getElementById("curRule").value;
                if (--i >= 0)
                    window.hilight(rules[i].solutions, [i], rules[i].triples);
            } else if (Focus == FOCUS.DATA) {
                var i = document.getElementById("curData").value;
                if (--i >= 0)
                    window.hilight(triples[i].solutions, triples[i].rules, [i]);
            } else alert(Focus.name);
        }
        document.getElementById("keysSolution").onkeydown = function () {
            if (event.keyCode == 38) up()
            else if (event.keyCode == 40) down();
        };
        // document.getElementById("up").onclick = function () { up(); }
        // document.getElementById("curSolution").onchange = function () { goTo(); }
        // document.getElementById("down").onclick = function () { down(); }

        window.onkeydown = function (e) {
            e = e || window.event;
            var keyCode = e.keyCode || e.which,
            arrow = {left: 37, up: 38, right: 39, down: 40 };

            if (e.ctrlKey && !e.shiftKey)
                switch (keyCode) {
                case arrow.up:
                    up();
                    return false;
                case arrow.down:
                    down();
                    return false;
                }
            return buttonKeys(e);
        };
        document.getElementById("export").style.display = 'inline';
        document.getElementById("nav").style.display = 'inline';
        document.getElementById("valQ").href = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(schema.obj.SPARQLvalidation(RDF.Prefixes))));
        document.getElementById("remQ").href = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(schema.obj.SPARQLremainingTriples(RDF.Prefixes))));
        var prefixes = RDF.Prefixes; // copy by value if we need to do anything with the orig.
        prefixes['se'] = "http://www.w3.org/2013/ShEx/Definition#";
        prefixes['rs'] = "http://open-services.net/ns/core#";
        document.getElementById("resourceShapes").href = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(schema.obj.toResourceShapes(prefixes, 'se', 'rs'))));
        window.Hmessage("done");
        if (validationResult.passed()) {
            var triplesEncountered = validationResult.triples();
            var remainingTriples = data.obj.triples.filter(
                function (t) {
                    //                return !validationResult.seen(t);
                    return triplesEncountered.indexOf(t) == -1;
                }
            );
            output.innerHTML +=
            (remainingTriples.length ? (
                "Remaining triples:\n<pre>\n"
                    + remainingTriples.map(
                        function (t) {
                            var ts = t.toString();
                            var ord = data.idMap.getInt(ts);
                            addClass("", data.idMap.getMembers(ord), "remainingData");
                            return ('  '
                                    + "<span onClick='window.hilight([], [], [" + ord + "]);' class='remainingData data'>"
                                    + ts.replace(/</gm, '&lt;').replace(/>/gm, '&gt;'))
                                + "</span>"
                                + "\n";
                        }
                    ).join('')
                    + "</pre>\n"
            ) : "No remaining triples.")
                + "\n";
        } else {
            output.innerHTML += "Remaining triples undefined for failed validation.\n";
        }
    } catch (e) {
	if (e !== '')
            output.textContent += "caught " + e;
    }
}
