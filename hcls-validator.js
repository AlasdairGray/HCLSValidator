function getQueryParams(qs) {
    qs = qs.split("+").join(" ");

    var params = {}, tokens,
        re = /[?&]?([^=]+)=([^&]*)/g;

    while (tokens = re.exec(qs)) {
        params[decodeURIComponent(tokens[1])]
            = decodeURIComponent(tokens[2]);
    }

    return params;
}

function getExternalText(url) {
	var text;
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open('GET', url, false);
	xmlhttp.send();
	return xmlhttp.responseText;
}
