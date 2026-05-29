<?php
require_once __DIR__ . '/config.php';

jsonResponse([
    'name' => 'music API',
    'version' => '1.7.2',
    'status' => 'running',
    'time' => date('Y-m-d H:i:s'),
    'endpoints' => [
        'auth' => [
            'POST php/login.php',
            'POST php/logout.php',
            'POST php/register.php',
            'POST php/register_verification.php',
            'POST php/verify_token.php',
            'POST php/verify_email.php',
            'POST php/forgot_password.php',
            'POST php/change_password.php',
            'POST php/update_avatar.php',
        ],
        'user_data' => [
            'POST php/favorite.php',
            'POST php/get_favorites.php',
            'POST php/sync_favorites.php',
            'POST php/playlist.php',
            'POST php/get_playlists.php',
            'POST php/get_playlist_id.php',
            'POST php/rename_playlist.php',
            'POST php/sync_playlists.php',
        ],
        'music' => [
            'GET php/toplist.php?type={soaring|new|original|hot|rap|electronic|euro_america|billboard|beatport|korean|uk}',
            'GET php/get_netease_playlist.php?id={id}',
            'GET php/get_netease_playlist.php?link={netease_url}',
            'GET php/check_version.php',
        ],
        'status' => [
            'GET api_check/api_doubtful.php',
            'GET api_check/check_api.php',
        ]
    ]
]);
