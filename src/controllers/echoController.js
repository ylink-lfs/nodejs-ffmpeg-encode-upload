/**
 * Echo Controller
 * Handles echo requests for debugging purposes
 */

// Echo GET request
export const echoGet = (req, res) => {
  res.json({
    message: "Echo GET response",
    method: "GET",
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
};

// Echo POST request
export const echoPost = (req, res) => {
  res.json({
    message: "Echo POST response",
    method: "POST",
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
    params: req.params,
    body: req.body,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
};
