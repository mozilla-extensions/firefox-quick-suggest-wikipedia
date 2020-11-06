/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function handleRequest(request, response) {
  Components.utils.importGlobalProperties(["URLSearchParams"]);
  let query = new URLSearchParams(request.queryString);
  let requestCount = parseInt(getState("requestCount") || 0, 10);
  if (!query.get("ignore")) {
    requestCount++;
    setState("requestCount", requestCount + "");
  }
  response.setHeader("Content-Type", "text/html", false);
  response.write(requestCount);
}
