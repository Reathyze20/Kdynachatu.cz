// Prisma connection strings may carry query parameters that libpq rejects
// (e.g. `?schema=public` -> `pg_dump: error: invalid URI query parameter: "schema"`).
// pg_dump/pg_restore get only the parameters libpq understands. Keys are compared raw:
// libpq keywords never need percent-encoding, so an encoded key is not one of them.
// Source: https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-PARAMKEYWORDS
const LIBPQ_URI_PARAMETERS = new Set([
  "host",
  "hostaddr",
  "port",
  "dbname",
  "user",
  "password",
  "passfile",
  "require_auth",
  "channel_binding",
  "connect_timeout",
  "client_encoding",
  "options",
  "application_name",
  "fallback_application_name",
  "keepalives",
  "keepalives_idle",
  "keepalives_interval",
  "keepalives_count",
  "tcp_user_timeout",
  "replication",
  "gssencmode",
  "sslmode",
  "sslnegotiation",
  "requiressl",
  "sslcompression",
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslcertmode",
  "sslrootcert",
  "sslcrl",
  "sslcrldir",
  "sslsni",
  "requirepeer",
  "ssl_min_protocol_version",
  "ssl_max_protocol_version",
  "krbsrvname",
  "gsslib",
  "gssdelegation",
  "service",
  "target_session_attrs",
  "load_balance_hosts",
  "min_protocol_version",
  "max_protocol_version",
  "sslkeylogfile",
  "oauth_issuer",
  "oauth_client_id",
  "oauth_client_secret",
  "oauth_scope",
  // libpq accepts `ssl=true` in URIs for JDBC compatibility (maps to sslmode=require).
  "ssl",
]);

/** Returns the connection URI with only libpq-supported query parameters; the rest of the string is untouched. */
export function toLibpqDatabaseUrl(databaseUrl: string): string {
  const queryStart = databaseUrl.indexOf("?");
  if (queryStart === -1) return databaseUrl;

  const base = databaseUrl.slice(0, queryStart);
  const kept = databaseUrl
    .slice(queryStart + 1)
    .split("&")
    .filter((pair) => LIBPQ_URI_PARAMETERS.has(pair.split("=")[0]));

  return kept.length > 0 ? `${base}?${kept.join("&")}` : base;
}
