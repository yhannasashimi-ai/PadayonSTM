import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class Server {
    static final Map<String, String> sessions = new ConcurrentHashMap<>(); 
    static final Path DATA = Path.of("data"), USERS = DATA.resolve("users.txt");
    static final Path WEB = Path.of("public").toAbsolutePath().normalize();

    public static void main(String[] args) throws Exception {
        Files.createDirectories(DATA);
        if (!Files.exists(USERS)) Files.createFile(USERS);
        
        // Use Render's PORT environment variable if available, otherwise default to 8080
        int port = System.getenv("PORT") != null ? Integer.parseInt(System.getenv("PORT")) : 8080;
        HttpServer s = HttpServer.create(new InetSocketAddress(port), 0);
        
        s.createContext("/", Server::files);
        s.createContext("/api/signup", x -> auth(x, true));
        s.createContext("/api/login", x -> auth(x, false));
        s.createContext("/api/state", Server::state);
        s.start();
        System.out.println("PADAYON running at port " + port);
    }

    static synchronized void auth(HttpExchange x, boolean signup) throws IOException {
        try {
            Map<String, String> f = form(new String(x.getRequestBody().readNBytes(2000), StandardCharsets.UTF_8));
            String email = f.getOrDefault("email", "").trim().toLowerCase(), pw = f.getOrDefault("password", "");
            if (!email.matches("^[^\\s@\"\\\\:]+@[^\\s@\"\\\\:]+\\.[^\\s@\"\\\\:]+$")) { 
                send(x, 400, "text/plain", "Please enter a valid email."); 
                return; }

            String line = null;
            for (String l : Files.readAllLines(USERS)) 
                if (l.startsWith(email + ":")) line = l;
            if (signup) {
                if (pw.length() < 6) { 
                    send(x, 400, "text/plain", "Password needs at least 6 characters."); 
                    return; }

                if (line != null) { 
                    send(x, 409, "text/plain", "That email already has an account. Try logging in."); 
                    return; }

                byte[] salt = new byte[16]; new SecureRandom().nextBytes(salt);

                Files.writeString(USERS, email + ":" + hex(salt) + ":" + hex(hash(pw, salt)) + "\n", StandardOpenOption.APPEND);
            } else {
                if (line == null) { 
                    send(x, 401, "text/plain", "Wrong email or password."); 
                    return; }

                String[] p = line.split(":");
                if (!MessageDigest.isEqual(unhex(p[2]), hash(pw, unhex(p[1])))) { 
                    send(x, 401, "text/plain", "Wrong email or password."); 
                    return; }
            }
            String token = UUID.randomUUID().toString();
            sessions.put(token, email);
            send(x, 200, "application/json", "{\"token\":\"" + token + "\",\"email\":\"" + email + "\"}");
        } catch (Exception e) { send(x, 500, "text/plain", "Something went wrong. Please try again."); }
    }

    static void state(HttpExchange x) throws IOException {
        String auth = x.getRequestHeaders().getFirst("Authorization");
        String email = auth == null ? null : sessions.get(auth.replace("Bearer ", ""));
        if (email == null) { send(x, 401, "text/plain", "Please log in"); return; }
        Path f = DATA.resolve(sha(email) + ".json");
        if (x.getRequestMethod().equals("POST")) {
            Files.write(f, x.getRequestBody().readNBytes(1_000_000));
            send(x, 200, "text/plain", "ok");
        } else {
            send(x, 200, "application/json", Files.exists(f) ? Files.readString(f) : "{\"taskStack\":[],\"historyStack\":[]}");
        }
    }

    static void files(HttpExchange x) throws IOException {
        String p = x.getRequestURI().getPath();
        Path f = WEB.resolve(p.equals("/") ? "index.html" : p.substring(1)).normalize();
        if (!f.startsWith(WEB) || !Files.isRegularFile(f)) { 
            send(x, 404, "text/plain", "Not found"); return; }
        String n = f.toString();
        String type = n.endsWith(".html") ? "text/html" : n.endsWith(".css") ? "text/css" : n.endsWith(".js") ? "text/javascript" : "application/octet-stream";
        send(x, 200, type + "; charset=utf-8", Files.readString(f));
    }

    static Map<String, String> form(String body) throws UnsupportedEncodingException {
        Map<String, String> m = new HashMap<>();
        for (String kv : body.split("&")) {
            String[] a = kv.split("=", 2);
            if (a.length == 2) m.put(URLDecoder.decode(a[0], "UTF-8"), URLDecoder.decode(a[1], "UTF-8"));
        }
        return m;
    }

    static byte[] hash(String pw, byte[] salt) throws Exception {
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(new PBEKeySpec(pw.toCharArray(), salt, 120000, 256)).getEncoded();
    }
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }
    static byte[] unhex(String h) { byte[] b = new byte[h.length() / 2]; for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16); return b; }
    static String sha(String s) { try { return hex(MessageDigest.getInstance("SHA-256").digest(s.getBytes())); } catch (Exception e) { throw new RuntimeException(e); } }

    static void send(HttpExchange x, int code, String type, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        x.getResponseHeaders().set("Content-Type", type);
        x.sendResponseHeaders(code, b.length);
        try (OutputStream o = x.getResponseBody()) { o.write(b); }
    }
}
