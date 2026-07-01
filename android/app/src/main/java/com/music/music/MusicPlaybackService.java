package com.music.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

public class MusicPlaybackService extends Service {
    static final String ACTION_UPDATE = "com.music.music.action.UPDATE_PLAYBACK";
    static final String ACTION_PLAY = "com.music.music.action.PLAY";
    static final String ACTION_PAUSE = "com.music.music.action.PAUSE";
    static final String ACTION_NEXT = "com.music.music.action.NEXT";
    static final String ACTION_PREVIOUS = "com.music.music.action.PREVIOUS";
    static final String ACTION_STOP = "com.music.music.action.STOP";
    static final String ACTION_WEB_COMMAND = "com.music.music.action.WEB_COMMAND";
    static final String EXTRA_COMMAND = "command";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_ARTIST = "artist";
    static final String EXTRA_PLAYING = "playing";

    private static final String CHANNEL_ID = "music_playback";
    private static final int NOTIFICATION_ID = 41731;

    private MediaSession mediaSession;
    private String title = "music";
    private String artist = "正在播放";
    private boolean playing;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        mediaSession = new MediaSession(this, "music");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                sendWebCommand("play");
            }

            @Override
            public void onPause() {
                sendWebCommand("pause");
            }

            @Override
            public void onSkipToNext() {
                sendWebCommand("next");
            }

            @Override
            public void onSkipToPrevious() {
                sendWebCommand("previous");
            }

            @Override
            public void onStop() {
                sendWebCommand("stop");
                stopPlayback();
            }
        });
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_UPDATE;
        if (ACTION_PLAY.equals(action)) {
            sendWebCommand("play");
            return START_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            sendWebCommand("pause");
            return START_STICKY;
        }
        if (ACTION_NEXT.equals(action)) {
            sendWebCommand("next");
            return START_STICKY;
        }
        if (ACTION_PREVIOUS.equals(action)) {
            sendWebCommand("previous");
            return START_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            sendWebCommand("stop");
            stopPlayback();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            title = clean(intent.getStringExtra(EXTRA_TITLE), "music");
            artist = clean(intent.getStringExtra(EXTRA_ARTIST), "正在播放");
            playing = intent.getBooleanExtra(EXTRA_PLAYING, false);
        }
        updateSessionState();
        Notification notification = buildNotification();
        if (playing) {
            startForeground(NOTIFICATION_ID, notification);
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(Service.STOP_FOREGROUND_DETACH);
            } else {
                stopForeground(false);
            }
            getNotificationManager().notify(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    private void stopPlayback() {
        playing = false;
        updateSessionState();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        getNotificationManager().cancel(NOTIFICATION_ID);
        stopSelf();
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent, pendingIntentFlags());

        Notification.Action previous = new Notification.Action.Builder(
                android.R.drawable.ic_media_previous,
                "上一首",
                serviceIntent(ACTION_PREVIOUS, 1)
        ).build();
        Notification.Action playPause = new Notification.Action.Builder(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "暂停" : "播放",
                serviceIntent(playing ? ACTION_PAUSE : ACTION_PLAY, 2)
        ).build();
        Notification.Action next = new Notification.Action.Builder(
                android.R.drawable.ic_media_next,
                "下一首",
                serviceIntent(ACTION_NEXT, 3)
        ).build();
        Notification.Action stop = new Notification.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel,
                "停止",
                serviceIntent(ACTION_STOP, 4)
        ).build();

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(contentIntent)
                .setOngoing(playing)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(previous)
                .addAction(playPause)
                .addAction(next)
                .addAction(stop)
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setCategory(Notification.CATEGORY_TRANSPORT);
        }
        return builder.build();
    }

    private PendingIntent serviceIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MusicPlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, requestCode, intent, pendingIntentFlags());
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }

    private void updateSessionState() {
        if (mediaSession == null) return;
        long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_STOP;
        int state = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
                .build());
        mediaSession.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .build());
        mediaSession.setActive(true);
    }

    private void sendWebCommand(String command) {
        Intent intent = new Intent(ACTION_WEB_COMMAND);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_COMMAND, command);
        sendBroadcast(intent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "音乐播放",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("music 后台播放控制");
        channel.setShowBadge(false);
        getNotificationManager().createNotificationChannel(channel);
    }

    private NotificationManager getNotificationManager() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private String clean(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}
