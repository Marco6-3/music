package com.music.music;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class LocalMusicServer {
    private static final String PREFS_NAME = "music_android_local_data";
    private static final String TOKEN = "local-token";
    private static final int PREFERRED_PORT = 41731;
    private static final int MAX_BODY_BYTES = 1024 * 1024;
    private static final String DEFAULT_PROVIDER = "gdstudio";
    private static final long MIN_FULL_AUDIO_BYTES = 512L * 1024L;

    private final Context context;
    private final SharedPreferences prefs;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private ServerSocket serverSocket;
    private volatile boolean running;
    private Thread acceptThread;
    private int port;

    LocalMusicServer(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    String start() throws IOException {
        if (running) return baseUrl();
        try {
            serverSocket = new ServerSocket(PREFERRED_PORT, 50, InetAddress.getByName("127.0.0.1"));
        } catch (IOException busy) {
            serverSocket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        }
        port = serverSocket.getLocalPort();
        running = true;
        acceptThread = new Thread(this::acceptLoop, "music-local-server");
        acceptThread.setDaemon(true);
        acceptThread.start();
        return baseUrl();
    }

    void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {
        }
        executor.shutdownNow();
    }

    private String baseUrl() {
        return "http://127.0.0.1:" + port + "/?source=android";
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket socket = serverSocket.accept();
                executor.execute(() -> handle(socket));
            } catch (IOException error) {
                if (running) error.printStackTrace();
            }
        }
    }

    private void handle(Socket socket) {
        try (Socket closeable = socket) {
            closeable.setSoTimeout(15000);
            InputStream input = new BufferedInputStream(closeable.getInputStream());
            OutputStream output = closeable.getOutputStream();
            HttpRequest request = readRequest(input);
            if (request == null) return;

            if ("GET".equals(request.method) && "/api.php".equals(request.path)) {
                handleMusicApi(request, output);
            } else if ("GET".equals(request.method) && "/php/toplist.php".equals(request.path)) {
                writeJson(output, 200, toplistResponse(request.query));
            } else if ("GET".equals(request.method) && "/api_check/api_doubtful.php".equals(request.path)) {
                writeJson(output, 200, sourceStatus());
            } else if (request.path.startsWith("/php/")) {
                writeJson(output, 200, handlePhp(request));
            } else if (request.path.startsWith("/offline/audio/")) {
                writeJson(output, 404, error("手机本地模式暂不提供离线音频文件缓存"));
            } else {
                serveAsset(request, output);
            }
        } catch (Exception error) {
            try {
                writePlain(socketOutput(socket), 500, "text/plain; charset=utf-8", "Local server error: " + error.getMessage());
            } catch (Exception ignored) {
            }
        }
    }

    private OutputStream socketOutput(Socket socket) throws IOException {
        return socket.getOutputStream();
    }

    private HttpRequest readRequest(InputStream input) throws IOException {
        String requestLine = readLine(input);
        if (requestLine == null || requestLine.isEmpty()) return null;
        String[] parts = requestLine.split(" ");
        if (parts.length < 2) return null;

        Map<String, String> headers = new LinkedHashMap<>();
        String line;
        while ((line = readLine(input)) != null && !line.isEmpty()) {
            int colon = line.indexOf(':');
            if (colon > 0) {
                headers.put(line.substring(0, colon).trim().toLowerCase(Locale.ROOT), line.substring(colon + 1).trim());
            }
        }

        int bodyLength = 0;
        try {
            bodyLength = Math.min(Integer.parseInt(headers.getOrDefault("content-length", "0")), MAX_BODY_BYTES);
        } catch (NumberFormatException ignored) {
        }
        byte[] bodyBytes = bodyLength > 0 ? readFixed(input, bodyLength) : new byte[0];

        String rawTarget = parts[1];
        int queryIndex = rawTarget.indexOf('?');
        String rawPath = queryIndex >= 0 ? rawTarget.substring(0, queryIndex) : rawTarget;
        String rawQuery = queryIndex >= 0 ? rawTarget.substring(queryIndex + 1) : "";
        String path = decode(rawPath);
        if (path.isEmpty()) path = "/";
        return new HttpRequest(parts[0].toUpperCase(Locale.ROOT), path, parseParams(rawQuery), new String(bodyBytes, StandardCharsets.UTF_8));
    }

    private String readLine(InputStream input) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int previous = -1;
        int current;
        while ((current = input.read()) != -1) {
            if (previous == '\r' && current == '\n') break;
            if (previous != -1) out.write(previous);
            previous = current;
        }
        if (current == -1 && previous == -1 && out.size() == 0) return null;
        if (current == -1 && previous != -1) out.write(previous);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private void handleMusicApi(HttpRequest request, OutputStream output) throws IOException {
        String type = request.query.getOrDefault("types", "");
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("X-Cache", "ANDROID-LOCAL");
        try {
            if ("search".equals(type)) {
                MusicApiResult result = searchSongs(
                        request.query.getOrDefault("source", DEFAULT_PROVIDER),
                        request.query.getOrDefault("name", request.query.getOrDefault("keyword", "")),
                        intParam(request.query.get("count"), 30));
                headers.put("X-Music-Source", result.source);
                writeBytes(output, 200, "application/json; charset=utf-8", result.array.toString().getBytes(StandardCharsets.UTF_8), headers);
                return;
            }
            if ("url".equals(type)) {
                MusicApiResult result = songUrl(request.query);
                headers.put("X-Music-Source", result.source);
                writeBytes(output, 200, "application/json; charset=utf-8", result.object.toString().getBytes(StandardCharsets.UTF_8), headers);
                return;
            }
            if ("lyric".equals(type)) {
                MusicApiResult result = lyric(request.query);
                headers.put("X-Music-Source", result.source);
                writeBytes(output, 200, "application/json; charset=utf-8", result.object.toString().getBytes(StandardCharsets.UTF_8), headers);
                return;
            }
            if ("pic".equals(type)) {
                MusicApiResult result = picture(request.query);
                headers.put("X-Music-Source", result.source);
                writeBytes(output, 200, "application/json; charset=utf-8", result.object.toString().getBytes(StandardCharsets.UTF_8), headers);
                return;
            }
            writeJson(output, 400, error("不支持的音乐接口类型"));
        } catch (Exception failure) {
            JSONObject payload = new JSONObject();
            try {
                payload.put("success", false).put("message", "手机本地音源暂时不可用: " + failure.getMessage());
            } catch (JSONException ignored) {
            }
            writeJson(output, 503, payload);
        }
    }

    private MusicApiResult searchSongs(String preferredSource, String keyword, int count) throws IOException, JSONException {
        if (TextUtils.isEmpty(keyword)) return MusicApiResult.array("empty", new JSONArray());
        Exception lastError = null;
        for (String source : providerOrder(preferredSource)) {
            try {
                JSONArray songs;
                if ("migu".equals(source)) {
                    songs = searchMigu(keyword, count);
                } else if ("kugou".equals(source)) {
                    songs = searchKugou(keyword, count);
                } else if ("gdstudio".equals(source)) {
                    songs = searchGdstudio(preferredSource, keyword, count);
                } else {
                    songs = searchKuwo(keyword, count);
                }
                if (songs.length() > 0) return MusicApiResult.array(source, songs);
            } catch (Exception error) {
                lastError = error;
            }
        }
        if (lastError instanceof IOException) throw (IOException) lastError;
        if (lastError instanceof JSONException) throw (JSONException) lastError;
        return MusicApiResult.array("empty", new JSONArray());
    }

    private MusicApiResult songUrl(Map<String, String> query) throws IOException, JSONException {
        String source = normalizeProvider(query.getOrDefault("source", DEFAULT_PROVIDER));
        Exception lastError = null;
        for (String provider : providerOrder(source)) {
            try {
                JSONObject result;
                if ("migu".equals(provider)) {
                    result = miguUrl(query.getOrDefault("id", ""), query.getOrDefault("br", "320"));
                } else if ("kugou".equals(provider)) {
                    result = kugouUrl(query, query.getOrDefault("br", "320"));
                } else if ("gdstudio".equals(provider)) {
                    result = gdstudioUrl(query);
                } else {
                    result = kuwoUrl(query.getOrDefault("id", ""), query.getOrDefault("br", "320"));
                }
                if (hasUrl(result)) return MusicApiResult.object(provider, result);
            } catch (Exception error) {
                lastError = error;
            }
        }
        if (lastError instanceof IOException) throw (IOException) lastError;
        if (lastError instanceof JSONException) throw (JSONException) lastError;
        return MusicApiResult.object("empty", error("暂时无法解析播放地址"));
    }

    private MusicApiResult lyric(Map<String, String> query) throws IOException, JSONException {
        String source = normalizeProvider(query.getOrDefault("source", DEFAULT_PROVIDER));
        if ("gdstudio".equals(source)) {
            JSONObject result = gdstudioObject("lyric", query, 5000, 7000);
            return MusicApiResult.object("gdstudio", result);
        }
        return MusicApiResult.object(source, new JSONObject());
    }

    private MusicApiResult picture(Map<String, String> query) throws IOException, JSONException {
        String source = normalizeProvider(query.getOrDefault("source", DEFAULT_PROVIDER));
        if ("migu".equals(source)) {
            JSONObject result = miguPic(query.getOrDefault("id", query.getOrDefault("pic_id", "")));
            return MusicApiResult.object("migu", result);
        }
        if ("gdstudio".equals(source)) {
            JSONObject result = gdstudioObject("pic", query, 5000, 7000);
            return MusicApiResult.object("gdstudio", result);
        }
        return MusicApiResult.object(source, new JSONObject());
    }

    private List<String> providerOrder(String preferredSource) {
        String preferred = normalizeProvider(preferredSource);
        List<String> order = new ArrayList<>();
        addProvider(order, preferred);
        addProvider(order, "gdstudio");
        addProvider(order, "kuwo");
        addProvider(order, "migu");
        addProvider(order, "kugou");
        return order;
    }

    private void addProvider(List<String> order, String source) {
        if (!TextUtils.isEmpty(source) && !order.contains(source)) order.add(source);
    }

    private String normalizeProvider(String source) {
        String value = firstNonEmpty(source, DEFAULT_PROVIDER).toLowerCase(Locale.ROOT);
        if ("migu".equals(value) || "kugou".equals(value) || "kuwo".equals(value)) return value;
        if ("gdstudio".equals(value) || "netease".equals(value) || "tencent".equals(value) || "baidu".equals(value) || "bilibili".equals(value)) {
            return "gdstudio";
        }
        return DEFAULT_PROVIDER;
    }

    private boolean hasUrl(JSONObject result) {
        return result != null && firstNonEmpty(result.optString("url"), result.optJSONObject("data") != null ? result.optJSONObject("data").optString("url") : "").startsWith("http");
    }

    private JSONArray searchKuwo(String keyword, int count) throws IOException, JSONException {
        if (TextUtils.isEmpty(keyword)) return new JSONArray();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("all", keyword);
        params.put("ft", "music");
        params.put("rn", String.valueOf(Math.max(1, Math.min(count, 30))));
        params.put("pn", "0");
        params.put("vipver", "MUSIC_9.1.1.2_BCS2");
        params.put("newsearch", "1");
        params.put("alflac", "1");
        params.put("encoding", "utf8");

        String body = fetchText("https://search.kuwo.cn/r.s?" + encodeForm(params), "https://www.kuwo.cn/");
        JSONArray songs = new JSONArray();
        Map<String, String> current = new LinkedHashMap<>();
        for (String rawLine : body.split("\n")) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;
            int eq = line.indexOf('=');
            if (eq <= 0) continue;
            String key = line.substring(0, eq);
            String value = line.substring(eq + 1);
            if ("SONGNAME".equals(key) && current.containsKey("SONGNAME")) {
                putKuwoSong(songs, current);
                current = new LinkedHashMap<>();
            }
            current.put(key, value);
        }
        putKuwoSong(songs, current);
        return songs;
    }

    private void putKuwoSong(JSONArray songs, Map<String, String> item) throws JSONException {
        String rid = item.getOrDefault("MUSICRID", "").replace("MUSIC_", "").replaceAll("\\D", "");
        String name = decodeHtml(item.getOrDefault("SONGNAME", ""));
        if (TextUtils.isEmpty(rid) || TextUtils.isEmpty(name)) return;
        songs.put(new JSONObject()
                .put("id", rid)
                .put("url_id", rid)
                .put("lyric_id", rid)
                .put("pic_id", rid)
                .put("name", name)
                .put("artist", decodeHtml(item.getOrDefault("ARTIST", "")))
                .put("album", decodeHtml(item.getOrDefault("ALBUM", "")))
                .put("source", "kuwo")
                .put("from", "android-kuwo-direct"));
    }

    private JSONArray searchMigu(String keyword, int count) throws IOException, JSONException {
        if (TextUtils.isEmpty(keyword)) return new JSONArray();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("keyword", keyword);
        params.put("type", "2");
        params.put("pgc", "1");
        params.put("rows", String.valueOf(Math.max(1, Math.min(count, 30))));
        params.put("pageNo", "1");
        String body = fetchText("https://m.music.cn.com/migu/remoting/scr_search_tag?" + encodeForm(params), "https://m.music.cn.com/", 7000, 10000);
        JSONObject json = new JSONObject(body);
        JSONArray records = json.optJSONArray("musics");
        if (records == null && json.optJSONObject("songResultData") != null) {
            records = json.optJSONObject("songResultData").optJSONArray("result");
        }
        JSONArray songs = new JSONArray();
        if (records == null) return songs;
        for (int i = 0; i < records.length() && songs.length() < count; i++) {
            JSONObject item = records.optJSONObject(i);
            if (item == null) continue;
            String id = firstNonEmpty(item.optString("copyrightId"), item.optString("songId"), item.optString("id"));
            String name = firstNonEmpty(item.optString("songName"), item.optString("name"), keyword);
            if (TextUtils.isEmpty(id) || TextUtils.isEmpty(name)) continue;
            songs.put(new JSONObject()
                    .put("id", id)
                    .put("url_id", id)
                    .put("lyric_id", id)
                    .put("pic_id", id)
                    .put("name", name)
                    .put("artist", miguArtists(item))
                    .put("album", firstNonEmpty(item.optString("albumName"), item.optString("album")))
                    .put("source", "migu")
                    .put("from", "android-migu-direct"));
        }
        return songs;
    }

    private String miguArtists(JSONObject item) {
        JSONArray singers = item.optJSONArray("singers");
        if (singers != null && singers.length() > 0) {
            List<String> names = new ArrayList<>();
            for (int i = 0; i < singers.length(); i++) {
                Object raw = singers.opt(i);
                if (raw instanceof JSONObject) {
                    String name = firstNonEmpty(((JSONObject) raw).optString("singerName"), ((JSONObject) raw).optString("name"));
                    if (!TextUtils.isEmpty(name)) names.add(name);
                } else if (raw != null && !TextUtils.isEmpty(String.valueOf(raw))) {
                    names.add(String.valueOf(raw));
                }
            }
            if (!names.isEmpty()) return join(names, ", ");
        }
        return firstNonEmpty(item.optString("singer"), item.optString("artist"), "未知艺术家");
    }

    private JSONArray searchKugou(String keyword, int count) throws IOException, JSONException {
        if (TextUtils.isEmpty(keyword)) return new JSONArray();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("keyword", keyword);
        params.put("page", "1");
        params.put("pagesize", String.valueOf(Math.max(1, Math.min(count, 30))));
        params.put("platform", "WebFilter");
        String body = fetchText("https://songsearch.kugou.com/song_search_v2?" + encodeForm(params), "https://www.kugou.com/", 7000, 10000);
        JSONObject json = new JSONObject(body);
        JSONObject data = json.optJSONObject("data");
        JSONArray records = data != null ? data.optJSONArray("lists") : null;
        JSONArray songs = new JSONArray();
        if (records == null) return songs;
        for (int i = 0; i < records.length() && songs.length() < count; i++) {
            JSONObject item = records.optJSONObject(i);
            if (item == null) continue;
            String id = firstNonEmpty(item.optString("FileHash"), item.optString("Hash"));
            String name = stripHtml(firstNonEmpty(item.optString("SongName"), item.optString("FileName")));
            if (TextUtils.isEmpty(id) || TextUtils.isEmpty(name)) continue;
            songs.put(new JSONObject()
                    .put("id", id)
                    .put("url_id", id)
                    .put("lyric_id", id)
                    .put("pic_id", firstNonEmpty(item.optString("AlbumID"), id))
                    .put("name", name)
                    .put("artist", stripHtml(firstNonEmpty(item.optString("SingerName"), "未知艺术家")))
                    .put("album", firstNonEmpty(item.optString("AlbumName"), ""))
                    .put("source", "kugou")
                    .put("from", "android-kugou-direct"));
        }
        return songs;
    }

    private JSONArray searchGdstudio(String preferredSource, String keyword, int count) throws IOException, JSONException {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("types", "search");
        params.put("source", gdstudioSource(preferredSource));
        params.put("name", keyword);
        params.put("count", String.valueOf(Math.max(1, Math.min(count, 30))));
        String body = fetchText("https://music-api.gdstudio.xyz/api.php?" + encodeForm(params), "https://music.xcloudv.top/", 4000, 6000);
        Object parsed = new org.json.JSONTokener(body).nextValue();
        if (parsed instanceof JSONArray) return (JSONArray) parsed;
        if (parsed instanceof JSONObject) {
            JSONArray data = ((JSONObject) parsed).optJSONArray("data");
            return data != null ? data : new JSONArray();
        }
        return new JSONArray();
    }

    private JSONObject kuwoUrl(String id, String quality) throws IOException, JSONException {
        if (TextUtils.isEmpty(id)) return error("缺少歌曲 ID");
        int br = intParam(quality, 320) >= 900 ? 320 : intParam(quality, 320);
        Map<String, String> params = new LinkedHashMap<>();
        params.put("type", "convert_url3");
        params.put("rid", id);
        params.put("format", "mp3");
        params.put("br", br + "k");
        params.put("response", "url");
        String body = fetchText("https://antiserver.kuwo.cn/anti.s?" + encodeForm(params), "https://www.kuwo.cn/").trim();
        String url = body;
        if (body.startsWith("{")) {
            JSONObject json = new JSONObject(body);
            url = firstNonEmpty(json.optString("url"), json.optJSONObject("data") != null ? json.optJSONObject("data").optString("url") : "");
        }
        if (!url.startsWith("http")) return error("暂时无法解析播放地址");
        if (isTinyAudio(url)) return error("酷我仅返回试听片段，已尝试换源");
        return new JSONObject().put("url", url).put("br", br).put("from", "android-kuwo-direct");
    }

    private JSONObject miguUrl(String id, String quality) throws IOException, JSONException {
        if (TextUtils.isEmpty(id)) return error("缺少歌曲 ID");
        int targetBr = intParam(quality, 320);
        String[] tones = targetBr >= 900 ? new String[]{"SQ", "HQ", "PQ"} : new String[]{"HQ", "PQ"};
        for (String tone : tones) {
            Map<String, String> params = new LinkedHashMap<>();
            params.put("copyrightId", id);
            params.put("contentId", id);
            params.put("resourceType", "E");
            params.put("toneFlag", tone);
            params.put("netType", "01");
            try {
                String body = fetchText("https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?" + encodeForm(params),
                        "https://music.migu.cn/", 7000, 10000, "channel", "0146951");
                JSONObject json = new JSONObject(body);
                Object rawData = json.opt("data");
                JSONObject data = rawData instanceof JSONObject ? (JSONObject) rawData : json;
                String url = firstNonEmpty(data.optString("url"), data.optString("newUrl"), data.optString("hqUrl"), data.optString("sqUrl"));
                if (url.startsWith("//")) url = "https:" + url;
                if (url.startsWith("http")) {
                    return new JSONObject().put("url", url).put("br", "SQ".equals(tone) ? 999 : ("HQ".equals(tone) ? 320 : 128)).put("from", "android-migu-direct");
                }
            } catch (Exception ignored) {
            }
        }
        return error("暂时无法解析咪咕播放地址");
    }

    private JSONObject kugouUrl(Map<String, String> query, String quality) throws IOException, JSONException {
        String keyword = firstNonEmpty(
                joinNonEmpty(query.get("artist"), query.get("name")),
                query.get("name"),
                query.get("id"));
        JSONArray candidates = searchKuwo(keyword, 3);
        if (candidates.length() == 0) return error("暂时无法解析酷狗播放地址");
        JSONObject first = candidates.getJSONObject(0);
        return kuwoUrl(first.optString("id"), quality).put("from", "android-kugou-via-kuwo");
    }

    private JSONObject gdstudioUrl(Map<String, String> query) throws IOException, JSONException {
        JSONObject direct = new JSONObject();
        try {
            direct = gdstudioObject("url", query, 4000, 6000);
            if (hasUrl(direct)) return direct;
        } catch (Exception ignored) {
        }

        String keyword = firstNonEmpty(
                joinNonEmpty(query.get("name"), query.get("artist")),
                query.get("name"),
                query.get("id"));
        if (TextUtils.isEmpty(keyword)) return direct;

        JSONArray candidates = searchGdstudio("netease", keyword, 3);
        if (candidates.length() == 0) return direct;
        JSONObject first = candidates.getJSONObject(0);
        Map<String, String> fallbackQuery = new LinkedHashMap<>(query);
        fallbackQuery.put("source", firstNonEmpty(first.optString("source"), "netease"));
        fallbackQuery.put("id", firstNonEmpty(first.optString("url_id"), first.optString("id")));
        fallbackQuery.put("name", firstNonEmpty(first.optString("name"), query.get("name")));
        fallbackQuery.put("artist", firstNonEmpty(first.optString("artist"), query.get("artist")));
        JSONObject fallback = gdstudioObject("url", fallbackQuery, 4000, 6000);
        if (hasUrl(fallback) && TextUtils.isEmpty(fallback.optString("from"))) {
            fallback.put("from", "music.gdstudio.xyz");
        }
        return fallback;
    }

    private JSONObject gdstudioObject(String type, Map<String, String> query, int connectTimeoutMs, int readTimeoutMs) throws IOException, JSONException {
        Map<String, String> params = new LinkedHashMap<>(query);
        params.put("types", type);
        params.put("source", gdstudioSource(query.get("source")));
        String body = fetchText("https://music-api.gdstudio.xyz/api.php?" + encodeForm(params), "https://music.xcloudv.top/", connectTimeoutMs, readTimeoutMs);
        Object parsed = new org.json.JSONTokener(body).nextValue();
        if (parsed instanceof JSONObject) return (JSONObject) parsed;
        return new JSONObject();
    }

    private JSONObject miguPic(String id) throws IOException, JSONException {
        if (TextUtils.isEmpty(id)) return new JSONObject();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("copyrightId", id);
        String body = fetchText("https://music.migu.cn/v3/api/music/audioPlayer/songs?" + encodeForm(params), "https://music.migu.cn/", 7000, 10000);
        JSONObject json = new JSONObject(body);
        JSONArray data = json.optJSONArray("data");
        if (data != null && data.length() > 0) {
            JSONObject item = data.optJSONObject(0);
            if (item != null) {
                String url = firstNonEmpty(item.optString("picL"), item.optString("picM"), item.optString("picS"));
                if (url.startsWith("http")) return new JSONObject().put("url", url);
            }
        }
        return new JSONObject();
    }

    private String fetchText(String url, String referer) throws IOException {
        return fetchText(url, referer, 8000, 12000);
    }

    private String fetchText(String url, String referer, int connectTimeoutMs, int readTimeoutMs, String... extraHeaderPairs) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(connectTimeoutMs);
        connection.setReadTimeout(readTimeoutMs);
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome Mobile Safari/537.36");
        connection.setRequestProperty("Accept", "*/*");
        connection.setRequestProperty("Referer", referer);
        for (int i = 0; i + 1 < extraHeaderPairs.length; i += 2) {
            connection.setRequestProperty(extraHeaderPairs[i], extraHeaderPairs[i + 1]);
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String body = new String(readAll(stream), StandardCharsets.UTF_8);
        connection.disconnect();
        if (status >= 400) throw new IOException("HTTP " + status);
        return body;
    }

    private boolean isTinyAudio(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("HEAD");
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome Mobile Safari/537.36");
            connection.setRequestProperty("Accept", "audio/*,*/*");
            int status = connection.getResponseCode();
            if (status >= 400) return false;
            long length = connection.getContentLengthLong();
            return length > 0 && length < MIN_FULL_AUDIO_BYTES;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String gdstudioSource(String source) {
        String value = firstNonEmpty(source, "netease").toLowerCase(Locale.ROOT);
        if ("kuwo".equals(value) || "kugou".equals(value) || "migu".equals(value) || "tencent".equals(value) || "baidu".equals(value) || "bilibili".equals(value)) {
            return value;
        }
        return "netease";
    }

    private String encodeForm(Map<String, String> params) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (out.length() > 0) out.append('&');
            try {
                out.append(URLEncoder.encode(entry.getKey(), "UTF-8"))
                        .append('=')
                        .append(URLEncoder.encode(entry.getValue(), "UTF-8"));
            } catch (Exception ignored) {
                out.append(entry.getKey()).append('=').append(entry.getValue());
            }
        }
        return out.toString();
    }

    private int intParam(String value, int fallback) {
        try {
            return Integer.parseInt(firstNonEmpty(value, String.valueOf(fallback)));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private String decodeHtml(String value) {
        return firstNonEmpty(value, "")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&apos;", "'");
    }

    private String stripHtml(String value) {
        return decodeHtml(firstNonEmpty(value, "").replaceAll("<[^>]+>", "")).trim();
    }

    private String join(List<String> values, String delimiter) {
        StringBuilder out = new StringBuilder();
        for (String value : values) {
            if (TextUtils.isEmpty(value)) continue;
            if (out.length() > 0) out.append(delimiter);
            out.append(value);
        }
        return out.toString();
    }

    private String joinNonEmpty(String left, String right) {
        String a = firstNonEmpty(left);
        String b = firstNonEmpty(right);
        if (TextUtils.isEmpty(a)) return b;
        if (TextUtils.isEmpty(b)) return a;
        return a + " " + b;
    }

    private JSONObject handlePhp(HttpRequest request) throws JSONException {
        Map<String, String> form = parseParams(request.body);
        String path = request.path;
        if (path.endsWith("/check_version.php")) return success().put("version", "android-local");
        if (path.endsWith("/register_verification.php") || path.endsWith("/forgot_password.php")) {
            return success().put("message", "手机本地模式已跳过邮件验证码");
        }
        if (path.endsWith("/register.php") || path.endsWith("/login.php") || path.endsWith("/verify_token.php")) {
            return success().put("token", TOKEN).put("user", getOrCreateUser(form));
        }
        if (path.endsWith("/logout.php")) return success().put("message", "已退出");
        if (path.endsWith("/get_favorites.php")) return new JSONObject().put("success", true).put("favorites", favorites());
        if (path.endsWith("/favorite.php")) return handleFavorite(form);
        if (path.endsWith("/get_playlists.php")) return new JSONObject().put("success", true).put("playlists", playlistsObject());
        if (path.endsWith("/get_playlist_id.php")) return success().put("playlist_id", playlistId(form.get("playlist_name")));
        if (path.endsWith("/playlist.php")) return handlePlaylist(form);
        if (path.endsWith("/rename_playlist.php")) return handleRenamePlaylist(form);
        if (path.endsWith("/sync_bundle.php") || path.endsWith("/sync_favorites.php") || path.endsWith("/sync_playlists.php")) {
            return handleSyncBundle(form);
        }
        if (path.endsWith("/play_history.php")) return handlePlayHistory(form);
        if (path.endsWith("/agent_assistant.php")) return error("手机本地模式暂不支持 AI 助手");
        return success();
    }

    private JSONObject getOrCreateUser(Map<String, String> form) throws JSONException {
        String email = firstNonEmpty(form.get("email"), form.get("username"), prefs.getString("email", "local@music.android"));
        prefs.edit().putString("email", email).apply();
        return userJson(email);
    }

    private JSONObject userJson(String email) throws JSONException {
        return new JSONObject()
                .put("id", 1)
                .put("username", email.contains("@") ? email.substring(0, email.indexOf('@')) : email)
                .put("email", email)
                .put("avatar", "")
                .put("email_verified", true)
                .put("favorites", favorites())
                .put("playlists", playlistsObject())
                .put("sync_state", new JSONObject());
    }

    private JSONObject handleFavorite(Map<String, String> form) throws JSONException {
        JSONArray items = favorites();
        JSONObject song = songFromForm(form);
        String action = form.getOrDefault("action", "add");
        JSONArray next = new JSONArray();
        boolean removed = false;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            if (sameSong(item, song)) {
                removed = true;
                if (!"remove".equals(action)) next.put(item);
            } else {
                next.put(item);
            }
        }
        if ("add".equals(action) && !removed) next.put(0, song);
        saveArray("favorites", next);
        return success().put("favorites", next);
    }

    private JSONObject handlePlaylist(Map<String, String> form) throws JSONException {
        JSONObject playlists = playlistsObject();
        String action = form.getOrDefault("action", "");
        String name = firstNonEmpty(form.get("name"), playlistNameById(form.get("playlist_id")), "默认歌单");
        if ("create".equals(action)) {
            if (!playlists.has(name)) playlists.put(name, new JSONArray());
        } else if ("delete".equals(action)) {
            playlists.remove(name);
        } else if ("add_song".equals(action)) {
            JSONArray songs = playlists.optJSONArray(name);
            if (songs == null) songs = new JSONArray();
            JSONObject song = songFromForm(form);
            if (!arrayHasSong(songs, song)) songs.put(0, song);
            playlists.put(name, songs);
        } else if ("remove_song".equals(action)) {
            JSONArray songs = playlists.optJSONArray(name);
            playlists.put(name, removeSong(songs == null ? new JSONArray() : songs, songFromForm(form)));
        }
        saveObject("playlists", playlists);
        return success().put("playlists", playlists);
    }

    private JSONObject handleRenamePlaylist(Map<String, String> form) throws JSONException {
        JSONObject playlists = playlistsObject();
        String oldName = firstNonEmpty(form.get("old_name"), "");
        String newName = firstNonEmpty(form.get("new_name"), "");
        if (!oldName.isEmpty() && !newName.isEmpty() && playlists.has(oldName)) {
            JSONArray songs = playlists.getJSONArray(oldName);
            playlists.remove(oldName);
            playlists.put(newName, songs);
            saveObject("playlists", playlists);
        }
        return success().put("playlists", playlists);
    }

    private JSONObject handleSyncBundle(Map<String, String> form) throws JSONException {
        String payload = form.get("payload");
        if (!TextUtils.isEmpty(payload)) {
            JSONObject json = new JSONObject(payload);
            if (json.has("favorites")) saveArray("favorites", json.getJSONArray("favorites"));
            if (json.has("playlists")) saveObject("playlists", json.getJSONObject("playlists"));
            if (json.has("recent_plays")) saveArray("recent_plays", json.getJSONArray("recent_plays"));
        }
        return success().put("user", userJson(prefs.getString("email", "local@music.android")))
                .put("recent_plays", recentPlays())
                .put("sync_state", new JSONObject());
    }

    private JSONObject handlePlayHistory(Map<String, String> form) throws JSONException {
        String action = form.getOrDefault("action", "record");
        if ("record".equals(action)) {
            JSONArray next = removeSong(recentPlays(), songFromForm(form));
            next.put(0, songFromForm(form));
            saveArray("recent_plays", trim(next, 100));
            return success();
        }
        if ("top".equals(action)) return new JSONObject().put("success", true).put("songs", recentPlays());
        if ("clear".equals(action)) {
            saveArray("recent_plays", new JSONArray());
            return success();
        }
        return new JSONObject().put("success", true).put("history", recentPlays());
    }

    private JSONObject toplistResponse(Map<String, String> query) throws JSONException {
        String type = query.getOrDefault("type", "soaring");
        JSONArray data;
        try {
            data = searchGdstudio("netease", toplistKeyword(type), 20);
        } catch (Exception gdstudioError) {
            try {
                data = searchKuwo(toplistKeyword(type), 20);
            } catch (Exception ignored) {
                data = new JSONArray();
            }
        }
        return new JSONObject().put("success", true).put("type", type).put("data", data);
    }

    private String toplistKeyword(String type) {
        if ("new".equals(type)) return "eason";
        if ("hot".equals(type)) return "jj";
        return "jay";
    }

    private JSONObject sourceStatus() throws JSONException {
        return new JSONObject()
                .put("kuwo", new JSONObject()
                        .put("name", "kuwo-direct")
                        .put("search", true)
                        .put("play", false)
                        .put("last_check", "android-local-preview-only"))
                .put("migu", new JSONObject()
                        .put("name", "migu-direct")
                        .put("search", false)
                        .put("play", false)
                        .put("last_check", "android-local-unreachable"))
                .put("kugou", new JSONObject()
                        .put("name", "kugou-via-kuwo")
                        .put("search", true)
                        .put("play", false)
                        .put("last_check", "android-local-preview-only"))
                .put("gdstudio", new JSONObject()
                        .put("name", "gdstudio")
                        .put("search", true)
                        .put("play", true)
                        .put("last_check", "android-local"));
    }

    private JSONObject songFromForm(Map<String, String> form) throws JSONException {
        String artist = firstNonEmpty(form.get("artist"), form.get("song_artist"), "未知艺术家");
        return new JSONObject()
                .put("id", firstNonEmpty(form.get("id"), form.get("song_id"), ""))
                .put("source", firstNonEmpty(form.get("source"), "netease"))
                .put("name", firstNonEmpty(form.get("name"), form.get("song_name"), form.get("song_title"), "未知歌曲"))
                .put("artist", artist)
                .put("album", firstNonEmpty(form.get("album"), ""))
                .put("pic_id", firstNonEmpty(form.get("pic_id"), form.get("song_cover"), ""))
                .put("cover_url", firstNonEmpty(form.get("cover_url"), form.get("song_cover"), ""));
    }

    private void serveAsset(HttpRequest request, OutputStream output) throws IOException {
        String path = request.path;
        if ("/".equals(path)) path = "/index.html";
        if (path.contains("..")) {
            writePlain(output, 403, "text/plain; charset=utf-8", "Forbidden");
            return;
        }
        String assetPath = "webroot" + path;
        try (InputStream stream = context.getAssets().open(assetPath)) {
            byte[] body = readAll(stream);
            if ("/index.html".equals(path)) {
                body = androidIndexHtml(body);
            }
            writeBytes(output, 200, mimeType(path), body, null);
        } catch (IOException missing) {
            writePlain(output, 404, "text/plain; charset=utf-8", "Not found");
        }
    }

    private byte[] androidIndexHtml(byte[] body) {
        String html = new String(body, StandardCharsets.UTF_8);
        String configScript = "<script>try{var s=localStorage.getItem('music_selected_source');if(!s||s==='kuwo'||s==='kugou'||s==='migu')localStorage.setItem('music_selected_source','netease');}catch(e){}</script>";
        if (!html.contains("music_selected_source','netease")) {
            html = html.replace("</head>", configScript + "</head>");
        }
        if (html.contains("<body>")) {
            html = html.replace("<body>", "<body class=\"is-browser-client is-standalone-pwa\">");
        }
        return html.getBytes(StandardCharsets.UTF_8);
    }

    private String mimeType(String path) {
        if (path.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
        if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        String ext = MimeTypeMap.getFileExtensionFromUrl(path);
        String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return type != null ? type : "application/octet-stream";
    }

    private JSONArray favorites() throws JSONException {
        return new JSONArray(prefs.getString("favorites", "[]"));
    }

    private JSONArray recentPlays() throws JSONException {
        return new JSONArray(prefs.getString("recent_plays", "[]"));
    }

    private JSONObject playlistsObject() throws JSONException {
        return new JSONObject(prefs.getString("playlists", "{}"));
    }

    private void saveArray(String key, JSONArray value) {
        prefs.edit().putString(key, value.toString()).apply();
    }

    private void saveObject(String key, JSONObject value) {
        prefs.edit().putString(key, value.toString()).apply();
    }

    private String playlistId(String name) {
        return String.valueOf(Math.abs(firstNonEmpty(name, "默认歌单").hashCode()));
    }

    private String playlistNameById(String id) throws JSONException {
        JSONObject playlists = playlistsObject();
        JSONArray names = playlists.names();
        if (names == null) return "默认歌单";
        for (int i = 0; i < names.length(); i++) {
            String name = names.getString(i);
            if (playlistId(name).equals(id)) return name;
        }
        return "默认歌单";
    }

    private boolean arrayHasSong(JSONArray array, JSONObject song) throws JSONException {
        for (int i = 0; i < array.length(); i++) {
            if (sameSong(array.getJSONObject(i), song)) return true;
        }
        return false;
    }

    private JSONArray removeSong(JSONArray array, JSONObject song) throws JSONException {
        JSONArray next = new JSONArray();
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.getJSONObject(i);
            if (!sameSong(item, song)) next.put(item);
        }
        return next;
    }

    private JSONArray trim(JSONArray array, int limit) throws JSONException {
        JSONArray next = new JSONArray();
        for (int i = 0; i < array.length() && i < limit; i++) next.put(array.get(i));
        return next;
    }

    private boolean sameSong(JSONObject a, JSONObject b) {
        return a.optString("id").equals(b.optString("id"))
                && firstNonEmpty(a.optString("source"), "netease").equals(firstNonEmpty(b.optString("source"), "netease"));
    }

    private JSONObject success() throws JSONException {
        return new JSONObject().put("success", true);
    }

    private JSONObject error(String message) throws JSONException {
        return new JSONObject().put("success", false).put("message", message);
    }

    private Map<String, String> parseParams(String raw) {
        Map<String, String> params = new LinkedHashMap<>();
        if (raw == null || raw.isEmpty()) return params;
        for (String pair : raw.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            String key = eq >= 0 ? pair.substring(0, eq) : pair;
            String value = eq >= 0 ? pair.substring(eq + 1) : "";
            params.put(decode(key), decode(value));
        }
        return params;
    }

    private String encodeParams(Map<String, String> params) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (out.length() > 0) out.append('&');
            out.append(android.net.Uri.encode(entry.getKey())).append('=').append(android.net.Uri.encode(entry.getValue()));
        }
        return out.toString();
    }

    private String decode(String value) {
        try {
            return java.net.URLDecoder.decode(value, "UTF-8");
        } catch (Exception ignored) {
            return value;
        }
    }

    private String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private byte[] readAll(InputStream stream) throws IOException {
        if (stream == null) return new byte[0];
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private byte[] readFixed(InputStream stream, int length) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(length);
        byte[] buffer = new byte[Math.min(8192, Math.max(1, length))];
        int remaining = length;
        while (remaining > 0) {
            int read = stream.read(buffer, 0, Math.min(buffer.length, remaining));
            if (read == -1) break;
            out.write(buffer, 0, read);
            remaining -= read;
        }
        return out.toByteArray();
    }

    private void writeJson(OutputStream output, int status, JSONObject json) throws IOException {
        writeBytes(output, status, "application/json; charset=utf-8", json.toString().getBytes(StandardCharsets.UTF_8), null);
    }

    private void writePlain(OutputStream output, int status, String contentType, String text) throws IOException {
        writeBytes(output, status, contentType, text.getBytes(StandardCharsets.UTF_8), null);
    }

    private void writeBytes(OutputStream output, int status, String contentType, byte[] body, Map<String, String> extraHeaders) throws IOException {
        StringBuilder headers = new StringBuilder();
        headers.append("HTTP/1.1 ").append(status).append(' ').append(statusReason(status)).append("\r\n");
        headers.append("Content-Type: ").append(contentType).append("\r\n");
        headers.append("Content-Length: ").append(body.length).append("\r\n");
        headers.append("Cache-Control: no-store\r\n");
        headers.append("Connection: close\r\n");
        headers.append("Access-Control-Allow-Origin: *\r\n");
        if (extraHeaders != null) {
            for (Map.Entry<String, String> entry : extraHeaders.entrySet()) {
                headers.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
            }
        }
        headers.append("\r\n");
        output.write(headers.toString().getBytes(StandardCharsets.UTF_8));
        output.write(body);
        output.flush();
    }

    private String statusReason(int status) {
        if (status == 200) return "OK";
        if (status == 302) return "Found";
        if (status == 403) return "Forbidden";
        if (status == 404) return "Not Found";
        if (status == 500) return "Internal Server Error";
        if (status == 503) return "Service Unavailable";
        return status >= 200 && status < 300 ? "OK" : "Error";
    }

    private static final class HttpRequest {
        final String method;
        final String path;
        final Map<String, String> query;
        final String body;

        HttpRequest(String method, String path, Map<String, String> query, String body) {
            this.method = method;
            this.path = path;
            this.query = query;
            this.body = body;
        }
    }

    private static final class MusicApiResult {
        final String source;
        final JSONArray array;
        final JSONObject object;

        private MusicApiResult(String source, JSONArray array, JSONObject object) {
            this.source = source;
            this.array = array;
            this.object = object;
        }

        static MusicApiResult array(String source, JSONArray array) {
            return new MusicApiResult(source, array, null);
        }

        static MusicApiResult object(String source, JSONObject object) {
            return new MusicApiResult(source, null, object);
        }
    }
}
