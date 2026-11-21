import SwiftUI

@main
struct MusicApp: App {
    private let origin = Bundle.main.object(forInfoDictionaryKey: "MusicWebOrigin")
        .flatMap { $0 as? String }
        .flatMap { URL(string: $0) }

    var body: some Scene {
        WindowGroup {
            Group {
                if let origin, origin.scheme == "https", origin.host != nil {
                    MusicWebView(origin: origin)
                        .ignoresSafeArea(.container)
                } else {
                    ContentUnavailableView(
                        "缺少音乐服务地址",
                        systemImage: "music.note",
                        description: Text("请安装已配置 HTTPS 服务地址的版本。")
                    )
                }
            }
            .background(Color(red: 0.03, green: 0.06, blue: 0.07).ignoresSafeArea())
            .preferredColorScheme(.dark)
        }
    }
}
