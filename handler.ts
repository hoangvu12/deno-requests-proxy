// deno-lint-ignore-file no-explicit-any

// https://stackoverflow.com/questions/1714786/query-string-encoding-of-a-javascript-object
const serialize = (obj: Record<string, any>) => {
  const str = [];
  for (const p in obj)
    if (p in obj) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
};

function paramsToObject(entries: IterableIterator<[string, string]>) {
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    // each 'entry' is a [key, value] tupple
    result[key] = value;
  }
  return result;
}

type ArrayHeader = Array<string>;
type Header = Record<string, any>;
type Query = {
  decompress?: boolean;
  ignoreReqHeaders?: boolean;
  redirectWithProxy?: boolean;
  followRedirect?: boolean;
  appendReqHeaders?: Header;
  appendResHeaders?: Header;
  deleteReqHeaders?: ArrayHeader;
  deleteResHeaders?: ArrayHeader;
  url?: string;
};

// [['cookie', 'x-foo']] -> [["cookie", "x-foo"]]
const parseHeaders = (stringHeaders: string): any[] => {
  try {
    return JSON.parse(stringHeaders);
  } catch {
    try {
      return JSON.parse(stringHeaders.replace(/'/g, '"'));
    } catch {
      return [];
    }
  }
};

// [["cookie", "x-foo"]] -> { cookie: "x-foo" }
const composeHeaders = (arrayOfHeaders: ArrayHeader[]) => {
  const headers: Header = {};

  arrayOfHeaders.forEach((header) => {
    headers[header[0]] = header[1];
  });

  return headers;
};

// Parse string to its type
const composeQuery = (originalQuery: Record<string, string>) => {
  const query: Query = { ...originalQuery };

  if (originalQuery?.decompress) {
    query.ignoreReqHeaders = originalQuery?.decompress === "true";
  }

  if (originalQuery?.ignoreReqHeaders) {
    query.ignoreReqHeaders = originalQuery?.ignoreReqHeaders === "true";
  }

  if (originalQuery?.redirectWithProxy) {
    query.ignoreReqHeaders = originalQuery?.redirectWithProxy === "true";
  }

  if (originalQuery?.followRedirect) {
    query.followRedirect = originalQuery?.followRedirect === "true";
  }

  if (originalQuery?.appendReqHeaders) {
    const headers = parseHeaders(originalQuery.appendReqHeaders);

    query.appendReqHeaders = composeHeaders(headers);
  }

  if (originalQuery?.appendResHeaders) {
    const headers = parseHeaders(originalQuery.appendResHeaders);

    query.appendResHeaders = composeHeaders(headers);
  }

  if (originalQuery?.deleteReqHeaders) {
    const headers = parseHeaders(originalQuery.deleteReqHeaders);

    query.deleteReqHeaders = headers;
  }

  if (originalQuery?.deleteResHeaders) {
    const headers = parseHeaders(originalQuery.deleteResHeaders);

    query.deleteResHeaders = headers;
  }

  return query;
};

// https://bobbyhadz.com/blog/javascript-lowercase-object-keys
const toLowerKeys = (obj: Record<string, any>) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));

const concatHeaders = (...args: Record<string, any>[]) => {
  const totalHeaders: Record<string, any> = {};

  for (const headers of args) {
    Object.assign(totalHeaders, toLowerKeys(headers));
  }

  return totalHeaders;
};

export default async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const entries = searchParams.entries();
  const query = composeQuery(paramsToObject(entries));

  const {
    url,
    ignoreReqHeaders = false,
    followRedirect = false,
    redirectWithProxy = false,
    appendReqHeaders = {},
    appendResHeaders = {},
    deleteReqHeaders = [],
    deleteResHeaders = [],
  } = query;

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  const decodedUrl = decodeURIComponent(url);

  const host = new URL(decodedUrl).host;

  let headers = concatHeaders({ host, ...appendReqHeaders });

  if (!ignoreReqHeaders) {
    headers = concatHeaders(req.headers, headers);
  }

  const filteredHeaders = Object.keys(headers).reduce(
    (acc: Record<string, any>, key) => {
      if (!deleteReqHeaders.includes(key)) {
        acc[key] = headers[key];
      }
      return acc;
    },
    {}
  );

  //   const response = await axios.get(decodedUrl, {
  //     responseType: "stream",
  //     headers: filteredHeaders,
  //     validateStatus: () => true,
  //     maxRedirects: !followRedirect ? 0 : 5,
  //     decompress,
  //   });

  const response = await fetch(decodedUrl, {
    headers: filteredHeaders,
    redirect: !followRedirect ? "manual" : "follow",
  });

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
  };

  const resHeaders = concatHeaders(
    response.headers,
    corsHeaders,
    appendResHeaders
  );

  const newResponse = new Response(response.body);

  for (const header in resHeaders) {
    if (deleteResHeaders.includes(header.toLowerCase())) continue;

    if (header.toLowerCase() === "location") {
      const originalUrl = resHeaders[header];
      const encodedUrl = encodeURIComponent(originalUrl);
      const redirectUrl = redirectWithProxy
        ? `/proxy?url=${encodedUrl}&${serialize(query)}`
        : originalUrl;

      return Response.redirect(redirectUrl, response.status);
    }

    newResponse.headers.set(header, resHeaders[header]);
  }

  return newResponse;
};