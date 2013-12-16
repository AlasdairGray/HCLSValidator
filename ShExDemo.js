//


ShExDemo = function() {
    var TIMEOUT = 500;
    var KB      = 1024;
    var MS_IN_S = 1000;

    var timers  = [null, null, null]
    var SCHEMA  = 1;
    var DATA    = 2;
    var VALPARM = 3;

	var SCHEMA_TEXT = "start%20%3D%20%3CVersionLevelShape%3E%0A%0A%3CEntryLevelShape%3E%20%7B%0A%20%20%20%20rdf%3Atype%20(dctypes%3ADataset)%2C%0A%20%20%20%20dct%3Atitle%20xsd%3Astring%2C%20%20%23%23%23%20should%20be%20rdf%3AlangString%20%0A%20%20%20%20dct%3Adescription%20xsd%3Astring%2C%20%23%23%23%20should%20be%20rdf%3AlangString%20%0A%20%20%20%20dct%3Apublisher%20rdf%3AResource%2C%0A%20%20%20%20(foaf%3Apage%20rdf%3AResource)%3F%2C%0A%20%20%20%20dct%3Alicense%20rdf%3AResource%0A%7D%0A%0A";

    var last    = {}; // Save input values to avoid needless re-execution.

    function setHandler(elts, handler) {
        elts.change(handler).mousedown(handler).mouseup(handler)
            .click(handler).keydown(handler).keyup(handler).keypress(handler);
            // .blur(handler).paste(handler).copy(handler).cut(handler)
    }

    /* Fancy execution time from http://pegjs.majda.cz/online */
    function buildSizeAndTimeInfoHtml(title, size, units, time) {
        return $("<span/>", {
            "class": "size-and-time",
            title:   title,
            html:    (size).toPrecision(2) + "&nbsp;" + units + ", "
                + time + "&nbsp;ms, "
                + ((size) / (time / MS_IN_S)).toPrecision(2) + "&nbsp;" + units + "/s"
        });
    }

    function buildErrorMessage(e) {
        return e.line !== undefined && e.column !== undefined
            ? "Line " + e.line + ", column " + e.column + ": " + e.message
            : e.message;
    }

    /* Turn bits of validator on or off depending on schema and data
     * availability */
    function disableValidator() {
        $("#validation-messages").attr("class", "message disabled").text("Validator not available.");
        $("#starting-node").attr("disabled", "disabled");
        $("#opt-pre-typed").attr("disabled", "disabled");
        $("#opt-find-type").attr("disabled", "disabled");
        $("#opt-disable-js").attr("disabled", "disabled");

        $("#valResults").addClass("disabled").text("Validation results not available.");
        $("#valResults-header").attr("class", "disabled");
    }

    function enableValidatorLink() {
        $("#validation-messages").removeAttr("disabled");
    }

    function enableValidatorInput() {
        $("#opt-pre-typed").removeAttr("disabled");
        $("#opt-find-type").removeAttr("disabled");
        $("#opt-disable-js").removeAttr("disabled");

        // $("#settings input[name='mode']").change(); would trigger handleParameterUpdate() so:
        if ($("#opt-pre-typed").is(":checked"))
            $("#starting-node").removeAttr("disabled");
    }

    function enableValidatorOutput() {
        $("#valResults-header").attr("class", "validation-color");
        return $("#valResults").removeClass("disabled");
    }

    function sanitizeEditable (element) {
        element.innerHTML = element.innerHTML
            .replace(/<div>/g, "\n").replace(/<\/div>/g, "") // chromium
            .replace(/<br>/g, "\n")                          // firefox
            .replace(/&nbsp;/g, " ")                         // nbsps in pirate pad
                                                             // ...?
        ;
    }

    // Interface object.
    // Can be used with just 
    //   $(document).ready(ShExDemo(RDF).loadAndStart());
    // or one can populate the panes before calling
    //   iface.allDataIsLoaded();
    var iface = {
        validator: null, schemaIdMap: null,
        graph: null, dataIdMap: null,
        queryParms: {},

        // Logging utilities
        message: function (m) {
            $("#validation-messages").append($('<div/>').text(m).html() + "<br/>");
        },

        // Simplest entry point for the ShExDemo.
        loadAndStart: function () {

            // control validation input
            $("#settings input[name='mode']").change(function () {
                if ($("#opt-pre-typed").is(":checked"))
                    $("#starting-node").removeAttr("disabled");
                else
                    $("#starting-node").attr("disabled", "disabled");
            }).change(); // .change() needed?

            // update history when keep-history is turned on
            $("#ctl-keep-history").change(function () {
                if (this.checked)
                    window.history.pushState(null, null, $("#permalink a").attr("href"));
            });

            // colorization switch
            $("#ctl-colorize").change(function () {
                if (this.checked)
                    iface.enablePre();
                else
                    iface.enableTextarea();
            });

            // reload saved state if there is one
            $("a").click( function() {
                $("#schema .save").val(escape($("#schema .textInput").val()));
                $("#data .save"  ).val(escape($("#data .textInput"  ).val()));
            } );
            if ($("#schema .save").val()) {
                $("#schema .textInput").val(unescape($("#schema .save").val()));
                $("#data .textInput"  ).val(unescape($("#data .save"  ).val()));
                iface.allDataIsLoaded();
            } else {
                var parseQueryString = function(query) {
                    if (query[0]==='?') query=query.substr(1); // optional leading '?'
                    var map   = {};
                    query.replace(/([^&,=]+)=?([^&,]*)(?:[&,]+|$)/g, function(match, key, value) {
                        key=decodeURIComponent(key);value=decodeURIComponent(value);
                        (map[key] = map[key] || []).push(value);
                    });
                    return map;
                };
                iface.queryParms = parseQueryString(location.search);

                // Keep track of pending parallel load opperations.
                var waitingOn = 0;
                if (iface.queryParms['schemaURL'])
                    waitingOn++;
                if (iface.queryParms['dataURL'])
                    waitingOn++;
                if (waitingOn === 0)
                    iface.loadDirectData();
                var joinAndRun = function() {
                    if (--waitingOn === 0) {
                        delete iface.queryParms['schemaURL'];
                        delete iface.queryParms['dataURL'];
                        iface.loadDirectData();
                    }
                }

                // Lists of schema and data parameters are loaded in sequence.
                // done() is called after the list is exhausted.
                var getSequenceOfURLs = function(list, into, done) {
                    if (list.length) {
                        $.ajax({
                            type: 'GET',
                            url: list[0],
                            success: function(data, textStatus, jqXHR) {
                                if (/^([a-z]+:)?\/\//g.test(list[0]))
                                    $('#opt-disable-js').attr('checked', true);
                                into.val(into.val()+data);
                                getSequenceOfURLs(list.slice(1), into, done);
                            },
                            error: function(jqXHR, textStatus, errorThrown) {
                                console.log("failed to load <" + list[0]
                                            + ">: Status: " + textStatus
                                            + " Message: " + errorThrown);
                                getSequenceOfURLs(list.slice(1), into, done);
                            }
                        });
                    } else {
                        done();
                    }
                }
                if (iface.queryParms['schemaURL']) {
                    $("#schema .textInput").val('');
                    getSequenceOfURLs(iface.queryParms['schemaURL'], $("#schema .textInput"), joinAndRun);
                }
                if (iface.queryParms['dataURL']) {
                    $("#data .textInput").val('');
                    getSequenceOfURLs(iface.queryParms['dataURL'], $("#data .textInput"), joinAndRun);
                }
            }
        },

        // Update the location bar with the new content.
        updateURL: function() {
            var attrs = Object.keys(iface.queryParms);
            var s = '?' + attrs.map(function(attr) {
                return iface.queryParms[attr].map(function (val) {
                    return encodeURIComponent(attr)+"="+encodeURIComponent(val);
                }).join('&');
            }).join('&');
            $("#permalink a").attr("href", location.pathname+s);
            if ($("#ctl-keep-history").is(":checked"))
                window.history.pushState(null, null, location.origin+location.pathname+s);
        },

        loadDirectData: function() {
            if (iface.queryParms['schema'])
                iface.queryParms['schema'].forEach(function(s) {
                    $('#opt-disable-js').attr('checked', true);
                    $("#schema .textInput").val($("#schema .textInput").val()+s);
                });
            if (iface.queryParms['data'])
                iface.queryParms['data'].forEach(function(s) {
                    $("#data .textInput").val($("#data .textInput").val()+s);
                });

            // Query parms will be rebuilt on event timeouts.
            delete iface.queryParms['schema'];
            delete iface.queryParms['data'];
            iface.allDataIsLoaded();
        },

        lert: function() {
            alert($(this).html());
        },

        allDataIsLoaded: function() {
            setHandler($("#schema .textInput"), iface.handleSchemaUpdate);
            setHandler($("#data .textInput"), iface.handleDataUpdate);
            setHandler($("#starting-node, #opt-pre-typed, #opt-find-type, #opt-disable-js"),
                       iface.handleParameterUpdate);

            iface.layoutPanels();
            $(window).resize(iface.layoutPanels);

            $("#apology").hide();
            $("#main").show();
            $("#schema .textInput, #data .textInput, #starting-node, #opt-pre-typed, #opt-find-type, #opt-disable-js")
                .removeAttr("disabled");
            $("#schema .textInput").focus(); // set focus after removeAttr("disabled").
            iface.parseSchema();
            iface.parseData();
            iface.validate();
        },

        // Timer controls
        clearTimer: function(timer) {
            if (timers[timer] !== null) {
                clearTimeout(timers[timer]);
                timers[timer] = null;
            }
        },

        setTimer: function(timer, action) {
            timers[timer] = setTimeout(function() {
                action();
                timers[timer] = null;
            }, TIMEOUT);
        },

        handleSchemaUpdate: function() {
            var now = $("#ctl-colorize").is(":checked")
                ? $("#schema").find("pre").get(0).innerText
                : $("#schema .textInput").val();
            if (now === last["#schema .textInput"])
                return;

            iface.clearTimer(SCHEMA);
            iface.clearTimer(VALPARM);
            iface.setTimer(SCHEMA, function() { iface.parseSchema() && iface.graph && iface.validate(); });
        },

        handleDataUpdate: function() {
            var now = $("#ctl-colorize").is(":checked")
                ? $("#data").find("pre").get(0).innerText
                : $("#data .textInput").val();
            if (now === last["#data .textInput"])
                return;

            iface.clearTimer(DATA);
            iface.clearTimer(VALPARM);
            iface.setTimer(DATA, function() { iface.parseData() && iface.validator && iface.validate(); });
        },

        handleParameterUpdate: function() {
            if($("#starting-node").val() === last["#starting-node"]
               && $("#opt-pre-typed").is(":checked") === last["#opt-pre-typed"]
               && $("#opt-disable-js").is(":checked") === last["#opt-disable-js"])
                return;

            if (timers[SCHEMA] !== null || timers[DATA] !== null)
                return;

            iface.clearTimer(VALPARM);
            iface.setTimer(VALPARM, function() { iface.validate(); });
        },

        // Factors out code common to schema and data parsers.
        runParser: function(id, label, colorClass, parse) {
            var now;
            if ($("#ctl-colorize").is(":checked")) {
                var element = $(id + " pre").get(0);
                sanitizeEditable(element);
                now = element.innerText
            } else {
                now = $(id + " .textInput").val();
            }

            last[id + " .textInput"] = now;
            iface.queryParms[id.substr(1)] = [now];
            
            $(id + " .message").attr("class", "message progress")
                .text("Parsing " + label + "...");
            disableValidator();

            var timeBefore = (new Date).getTime();
            var ret = {obj: parse(now)};
            var timeAfter = (new Date).getTime();

            $(id + " .message")
                .attr("class", "message " + colorClass)
                .text(label + " parsed.")
                .append(buildSizeAndTimeInfoHtml(
                    label + " parsing time and speed",
                    $(id + " .textInput").val().length / KB, "kB",
                    timeAfter - timeBefore
                ));
            if ($("#ctl-colorize").is(":checked")) {
                var element = $(id + " pre").get(0);
                var textMap = new CharMap(now);
                textMap.HTMLescape();
                ret.idMap = ret.obj.colorize(textMap)
                element.innerHTML = textMap.text;
            }
            return ret;
        },

        parseSchema: function() {
            $("#view a").addClass("disabled");
            iface.validator = null;
            try {
                var ret = iface.runParser("#schema", "Schema", "schema-color", function(text) {
                    return ShExParser.parse(text, "ShExDoc");
                });
                iface.validator = ret.obj;
                iface.schemaIdMap = ret.idMap;
                enableValidatorLink();
                if (iface.graph)
                    enableValidatorInput();
                var dtp = "data:text/plain;charset=utf-8;base64,";
                $("#as-sparql-query"     ).attr("href", dtp + Base64.encode(iface.validator.SPARQLvalidation(RDF.Prefixes)));
                $("#as-remaining-triples").attr("href", dtp + Base64.encode(iface.validator.SPARQLremainingTriples(RDF.Prefixes)));
                var prefixes = RDF.Prefixes; // copy by value if we need to do anything with the orig.
                prefixes['se'] = "http://www.w3.org/2013/ShEx/Definition#";
                prefixes['rs'] = "http://open-services.net/ns/core#";
                $("#as-resource-shape"   ).attr("href", dtp + Base64.encode(iface.validator.toResourceShapes(prefixes, 'se', 'rs')));
                $("#as-resource-sexpr"   ).attr("href", dtp + Base64.encode(iface.validator.toSExpression(0)));
                $("#view a").removeClass("disabled");
            } catch (e) {
                $("#schema .message").attr("class", "message error").text(buildErrorMessage(e));
                var unavailable = "data:text/plain;charset=utf-8;base64,"
                    + Base64.encode("Alternate representations unavailable when ShEx fails to parse.");
                $("#as-sparql-query"     ).attr("href", unavailable);
                $("#as-remaining-triples").attr("href", unavailable);
                $("#as-resource-shape"   ).attr("href", unavailable);
                $("#as-resource-sexpr"   ).attr("href", unavailable);
            }
//            iface.layoutPanels();
            return iface.validator !== null;
        },

        parseData: function() {
            iface.graph = null;
            try {
                var ret = iface.runParser("#data", "Data", "data-color", function(text) {
                    return TurtleParser.parse(text);
                });
                iface.graph = ret.obj;
                iface.dataIdMap = ret.idMap;
                if (iface.validator) {
                    enableValidatorLink();
                    enableValidatorInput();
                }
                if (iface.graph.length())
                    $("#starting-node").val(iface.graph.slice(0,1)[0].s);
            } catch (e) {
                $("#data .message").attr("class", "message error").text(buildErrorMessage(e));
            }

//            iface.layoutPanels();
            return iface.graph !== null;
        },

        validate: function() {
            if (!iface.validator || !iface.graph)
                return;

            last["#starting-node"]     = $("#starting-node").val();
            last["#opt-pre-typed"]  = $("#opt-pre-typed").is(":checked"),
            last["#opt-disable-js"] = $("#opt-disable-js").is(":checked")

            $("#validation-messages").text("");

            try {
                var timeBefore = (new Date).getTime();
                iface.validator.termResults = {}; // clear out yester-cache

                iface.validator.disableJavascript = $("#opt-disable-js").is(":checked");
                if (iface.validator.disableJavascript)
                    iface.message("javascript disabled");

                var validationResult
                if ($("#opt-pre-typed").is(":checked") && iface.validator.startRule) {
                    var startingNode = $("#starting-node").val();
                    iface.message("validating " + startingNode + " as " + iface.validator.startRule.toString());
                    validationResult = iface.validator.validate(startingNode, iface.validator.startRule, iface.graph);
                } else {
                    iface.message("looking for types");
                    validationResult = iface.validator.validate(undefined, iface.validator.startRule, iface.graph);
                }

                var timeAfter = (new Date).getTime();

                $("#validation-messages")
                    .attr("class", "message validation-color")
                    .append(buildSizeAndTimeInfoHtml(
                        "Validation time and speed",
                        iface.graph.length(), "triples",
                        timeAfter - timeBefore
                    ));
                iface.message("Validation complete.");
                var valResultsElement = enableValidatorOutput();
                if ($("#ctl-colorize").is(":checked")) {
                    iface.foo(validationResult, valResultsElement);
                } else {
                    valResultsElement.text(validationResult.toString(0));
                }
            } catch (e) {
                $("#validation-messages").attr("class", "message error").text(e);
            }
//            iface.layoutPanels();
            iface.updateURL();
        },

        foo: function(validationResult, valResultsElement) {
            // non-jquery functions from SimpleShExDemo
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

            var solutions = [];
            valResultsElement.get()[0].innerHTML
                = validationResult.toHTML(0, iface.schemaIdMap, iface.dataIdMap, solutions,
                                          { schema: 'schemaflow', data: 'dataflow',
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
                    removeClass("", iface.dataIdMap.getMembers(lastTriple[i]), "hilightData");

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
                        addClass("", iface.dataIdMap.getMembers(dataList[i]), "hilightData");

                    // Write down current state.
                    lastRule = schemaList;
                    lastTriple = dataList;
                    lastSolution = solutionList;
                }
            };

            function down () {
                var f = $(document.activeElement)[0];
                if (f === $("#schema .textInput")[0]) {
                    var i = document.getElementById("curRule").value;
                    if (++i < rules.length)
                        hilight(rules[i].solutions, [i], rules[i].triples);
                } else if (f === $("#data .textInput")[0]) {
                    var i = document.getElementById("curData").value;
                    if (++i < triples.length)
                        hilight(triples[i].solutions, triples[i].rules, [i]);
                } else {
                    var i = document.getElementById("curSolution").value;
                    if (++i < solutions.length)
                        hilight([i], solutions[i].rule === undefined ? [] : [solutions[i].rule], solutions[i].triple === undefined ? [] : [solutions[i].triple]);
                }
            }
            // function goTo () {
            //     var s = document.getElementById("curSolution").value;
            //     if (s < 0 || s > solutions.length-1)
            //         s = 0;
            //     document.getElementById("curSolution").value = s;
            //     hilight([s], [solutions[s].rule], [solutions[s].triple]);
            // }
            function up () {
                var f = $(document.activeElement)[0];
                if (f === $("#schema .textInput")[0]) {
                    var i = document.getElementById("curRule").value;
                    if (--i >= 0)
                        hilight(rules[i].solutions, [i], rules[i].triples);
                } else if (f === $("#data .textInput")[0]) {
                    var i = document.getElementById("curData").value;
                    if (--i >= 0)
                        hilight(triples[i].solutions, triples[i].rules, [i]);
                } else {
                    var i = document.getElementById("curSolution").value;
                    if (--i >= 0)
                        hilight([i], solutions[i].rule === undefined ? [] : [solutions[i].rule], solutions[i].triple === undefined ? [] : [solutions[i].triple]);
                }
            }
            // document.getElementById("keysSolution").onkeydown = function () {
            //     if (event.keyCode == 38) up()
            //     else if (event.keyCode == 40) down();
            // };
            // document.getElementById("up").onclick = function () { up(); }
            // document.getElementById("curSolution").onchange = function () { goTo(); }
            // document.getElementById("down").onclick = function () { down(); }

            function keydown(e) {
                function buttonKeys (e) {
                    e = e || window.event;
                    var keyCode = e.keyCode || e.which;
                    var f = $(document.activeElement)[0];
                    if (!e.ctrlKey && f !== $("#schema .textInput")[0] && f !== $("#data .textInput")[0]) {
                        if (e.shiftKey) {
                            // Moved output.clear down into simple validate. Keeping
                            // old code and inputs around for later reversion.
                            // if (keyCode == 86) {
                            //     document.getElementById("output").textContent = "";
                            //     validate();
                            //     return false;
                            // }
                        } else {
                            switch (keyCode) {
                            case 86:
                                document.getElementById("output").textContent = "";
                                validate();
                                return false;
                                // case 82:
                                //     if (e.ctrlKey)
                                //         return true;
                                //     document.getElementById("output").textContent = "";
                                //     return false;
                            case 83:
                                if (e.ctrlKey)
                                    return true;
                                document.getElementById("schemaText").textContent = "";
                                return false;
                            case 68:
                                if (e.ctrlKey)
                                    return true;
                                document.getElementById("turtleText").textContent = "";
                                return false;
                            }
                        }
                    }
                    return true;
                }

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
            $("#main"       ).bind("keydown", keydown);
        },

        enablePre: function() {
            $("#schema, #data").each(function(el) {
                $(this).find("pre").get(0).innerText = $(this).find("textarea").val();
                var width = $(this).width();
                $(this).find("textarea").hide().removeClass("textInput");
                $(this).find("pre").addClass("textInput").show();
                $(this).width(width);
                $(this).find(".editparent").contentEditable().change(iface.handleSchemaUpdate);
            });
            iface.parseSchema();
            iface.parseData();
            if (iface.validator && iface.graph)
                iface.validate();
        },

        enableTextarea: function() {
            $("#schema, #data").each(function(el) {
                $(this).find("textarea").val($(this).find("pre").get(0).innerText);
                $(this).find("pre").hide().removeClass("textInput");
                $(this).find("textarea").addClass("textInput").show();
            });
        },

        layoutPanels: function() {
            if ($("#ctl-colorize").is(":checked")) // brutal hack
                iface.enableTextarea();
            $("#schema .textInput").height(($("#schema .textInput").parent().parent().innerHeight()/2) + "px");
            $("#data .textInput").height(($("#data .textInput").parent().parent().innerHeight()/2) + "px");
            if ($("#ctl-colorize").is(":checked"))
                iface.enablePre();
        }

    };

    return iface;
};
