(function(){'use strict';if(document['\u0072\u0065\u0061\u0064\u0079\u0053\u0074\u0061\u0074\u0065']==="\u006C\u006F\u0061\u0064\u0069\u006E\u0067"){document['\u0061\u0064\u0064\u0045\u0076\u0065\u006E\u0074\u004C\u0069\u0073\u0074\u0065\u006E\u0065\u0072']("\u0044\u004F\u004D\u0043\u006F\u006E\u0074\u0065\u006E\u0074\u004C\u006F\u0061\u0064\u0065\u0064",_0x4c9b);}else{_0x4c9b();}async function _0x4c9b(){var _0x5e2b;const _0x74e=_0xg23f3g();_0x5e2b="bhfiep".split("").reverse().join("");if(_0x74e){_0xd9b();}}function _0xg23f3g(){try{const _0x7ad=JSON['\u0070\u0061\u0072\u0073\u0065'](localStorage['\u0067\u0065\u0074\u0049\u0074\u0065\u006D']("\u0066\u0061\u0076\u006F\u0072\u0069\u0074\u0065\u0073")||"\u005B\u005D");var _0x1e48ef;const _0xgg2aa=_0x7ad['\u0073\u006F\u006D\u0065'](song=>song['\u0073\u006F\u0075\u0072\u0063\u0065']==="xooj".split("").reverse().join(""));_0x1e48ef='\u0070\u0065\u006F\u0066\u0064\u006C';if(_0xgg2aa){console['\u006C\u006F\u0067']("\u66F2\u6B4C\u7684\u6E90 XOOJ \u6709\u4E2D\u85CF\u6536\u73B0\u53D1".split("").reverse().join(""));return!![];}const _0x7fd2fe=JSON['\u0070\u0061\u0072\u0073\u0065'](localStorage['\u0067\u0065\u0074\u0049\u0074\u0065\u006D']("\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u0073")||"\u007B\u007D");for(const[playlistName,songs]of Object['\u0065\u006E\u0074\u0072\u0069\u0065\u0073'](_0x7fd2fe)){const _0x32c6e=songs['\u0073\u006F\u006D\u0065'](song=>song['\u0073\u006F\u0075\u0072\u0063\u0065']==="xooj".split("").reverse().join(""));if(_0x32c6e){console['\u006C\u006F\u0067'](`发现歌单"${playlistName}"中有 JOOX 源的歌曲`);return!![];}}return false;}catch(error){console['\u0065\u0072\u0072\u006F\u0072']("\u68C0\u67E5\u0020\u004A\u004F\u004F\u0058\u0020\u6B4C\u66F2\u65F6\u51FA\u9519\u003A",error);return!![];}}function _0xd9b(){const _0x6dede=`
    <div class="joox-deletion-modal" id="jooxDeletionModal">
        <div class="joox-deletion-content">
            <div class="joox-deletion-icon">⚠️</div>
            <h3>重要通知</h3>
            <p>由于不可抗因素，本站将停止提供 JOOX 源的任何服务。</p>
            <p>点击下方按钮以一键删除您的歌单、收藏内的 JOOX 源音乐。</p>
            <button class="joox-deletion-confirm-btn" id="jooxDeletionConfirmBtn">确定删除</button>
        </div>
    </div>
`;const _0xfadfd=document['\u0063\u0072\u0065\u0061\u0074\u0065\u0045\u006C\u0065\u006D\u0065\u006E\u0074']("elyts".split("").reverse().join(""));_0xfadfd['\u0074\u0065\u0078\u0074\u0043\u006F\u006E\u0074\u0065\u006E\u0074']=`
    .joox-deletion-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        z-index: 20000;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease;
    }

    .joox-deletion-content {
        background-color: var(--card-bg, #fff);
        border-radius: 15px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        animation: slideIn 0.3s ease;
    }

    .joox-deletion-icon {
        font-size: 64px;
        margin-bottom: 20px;
    }

    .joox-deletion-content h3 {
        color: var(--text-color, #333);
        margin: 0 0 20px 0;
        font-size: 24px;
        font-weight: 600;
    }

    .joox-deletion-content p {
        color: var(--text-color, #666);
        line-height: 1.6;
        margin: 0 0 15px 0;
        font-size: 16px;
    }

    .joox-deletion-content p:last-of-type {
        margin-bottom: 30px;
    }

    .joox-deletion-confirm-btn {
        background: var(--primary-color, #007bff);
        color: white;
        border: none;
        padding: 14px 40px;
        border-radius: 8px;
        font-size: 18px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 150px;
    }

    .joox-deletion-confirm-btn:hover {
        background: var(--secondary-color, #0056b3);
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0, 123, 255, 0.4);
    }

    .joox-deletion-confirm-btn:active {
        transform: translateY(0);
    }

    .joox-deletion-confirm-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-30px) scale(0.9);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    /* 深色模式适配 */
    [data-theme="dark"] .joox-deletion-content {
        background-color: #2d2d2d;
    }

    [data-theme="dark"] .joox-deletion-content h3 {
        color: #f0f0f0;
    }

    [data-theme="dark"] .joox-deletion-content p {
        color: #d0d0d0;
    }
`;if(!document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u006A\u006F\u006F\u0078\u002D\u0064\u0065\u006C\u0065\u0074\u0069\u006F\u006E\u002D\u0073\u0074\u0079\u006C\u0065")){_0xfadfd['\u0069\u0064']="\u006A\u006F\u006F\u0078\u002D\u0064\u0065\u006C\u0065\u0074\u0069\u006F\u006E\u002D\u0073\u0074\u0079\u006C\u0065";document['\u0068\u0065\u0061\u0064']['\u0061\u0070\u0070\u0065\u006E\u0064\u0043\u0068\u0069\u006C\u0064'](_0xfadfd);}var _0x4g3fa=(442491^442492)+(795181^795183);const _0xe038cg=document['\u0063\u0072\u0065\u0061\u0074\u0065\u0045\u006C\u0065\u006D\u0065\u006E\u0074']("vid".split("").reverse().join(""));_0x4g3fa=(228478^228471)+(974842^974845);_0xe038cg['\u0069\u006E\u006E\u0065\u0072\u0048\u0054\u004D\u004C']=_0x6dede;const _0x02340e=_0xe038cg['\u0066\u0069\u0072\u0073\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0043\u0068\u0069\u006C\u0064'];document['\u0062\u006F\u0064\u0079']['\u0061\u0070\u0070\u0065\u006E\u0064\u0043\u0068\u0069\u006C\u0064'](_0x02340e);var _0x8e2aeg=(212447^212438)+(574880^574886);const _0xdc4acf=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u006A\u006F\u006F\u0078\u0044\u0065\u006C\u0065\u0074\u0069\u006F\u006E\u0043\u006F\u006E\u0066\u0069\u0072\u006D\u0042\u0074\u006E");_0x8e2aeg=325145^325151;_0xdc4acf['\u0061\u0064\u0064\u0045\u0076\u0065\u006E\u0074\u004C\u0069\u0073\u0074\u0065\u006E\u0065\u0072']("\u0063\u006C\u0069\u0063\u006B",async()=>{_0xdc4acf['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=!![];_0xdc4acf['\u0074\u0065\u0078\u0074\u0043\u006F\u006E\u0074\u0065\u006E\u0074']="\u5220\u9664\u4E2D\u002E\u002E\u002E";await _0x9c2a();_0x02340e['\u0073\u0074\u0079\u006C\u0065']['\u0064\u0069\u0073\u0070\u006C\u0061\u0079']="enon".split("").reverse().join("");setTimeout(()=>{_0x02340e['\u0072\u0065\u006D\u006F\u0076\u0065']();},211858^211646);});_0x02340e['\u0061\u0064\u0064\u0045\u0076\u0065\u006E\u0074\u004C\u0069\u0073\u0074\u0065\u006E\u0065\u0072']("kcilc".split("").reverse().join(""),e=>{if(e['\u0074\u0061\u0072\u0067\u0065\u0074']===_0x02340e){e['\u0073\u0074\u006F\u0070\u0050\u0072\u006F\u0070\u0061\u0067\u0061\u0074\u0069\u006F\u006E']();}});}async function _0x9c2a(){try{console['\u006C\u006F\u0067']("...\u66F2\u6B4C\u7684\u6E90 XOOJ \u6709\u6240\u9664\u5220\u59CB\u5F00".split("").reverse().join(""));var _0xeecc=(816354^816354)+(838691^838689);let _0xc0022g=475164^475164;_0xeecc=858960^858968;const _0xd_0xb36=await _0x22e4fd();_0xc0022g+=_0xd_0xb36;const _0xac6f2=await _0x149e();_0xc0022g+=_0xac6f2;if(_0xc0022g>(249314^249314)){console['\u006C\u006F\u0067'](`已删除 ${_0xc0022g} 首 JOOX 源的歌曲`);if(typeof showToast==="noitcnuf".split("").reverse().join("")){showToast(`已删除 ${_0xc0022g} 首 JOOX 源的歌曲`,"\u0073\u0075\u0063\u0063\u0065\u0073\u0073",482502^479054);}}else{console['\u006C\u006F\u0067']("\u672A\u627E\u5230\u0020\u004A\u004F\u004F\u0058\u0020\u6E90\u7684\u6B4C\u66F2");if(typeof showToast==="\u0066\u0075\u006E\u0063\u0074\u0069\u006F\u006E"){showToast("\u66F2\u6B4C\u7684\u6E90 XOOJ \u5230\u627E\u672A".split("").reverse().join(""),"\u0069\u006E\u0066\u006F",748151^745935);}}}catch(error){console['\u0065\u0072\u0072\u006F\u0072']("\u5220\u9664\u0020\u004A\u004F\u004F\u0058\u0020\u6B4C\u66F2\u65F6\u51FA\u9519\u003A",error);if(typeof showToast==="\u0066\u0075\u006E\u0063\u0074\u0069\u006F\u006E"){showToast("\u5220\u9664\u8FC7\u7A0B\u4E2D\u51FA\u73B0\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5","\u0065\u0072\u0072\u006F\u0072",165727^169175);}}}async function _0x22e4fd(){try{const _0xedca=JSON['\u0070\u0061\u0072\u0073\u0065'](localStorage['\u0067\u0065\u0074\u0049\u0074\u0065\u006D']("setirovaf".split("").reverse().join(""))||"][".split("").reverse().join(""));const _0xd077cf=_0xedca['\u0066\u0069\u006C\u0074\u0065\u0072'](song=>song['\u0073\u006F\u0075\u0072\u0063\u0065']==="\u006A\u006F\u006F\u0078");if(_0xd077cf['\u006C\u0065\u006E\u0067\u0074\u0068']===(416968^416968)){return 342707^342707;}const _0x47bf3f=_0xedca['\u0066\u0069\u006C\u0074\u0065\u0072'](song=>song['\u0073\u006F\u0075\u0072\u0063\u0065']!=="\u006A\u006F\u006F\u0078");localStorage['\u0073\u0065\u0074\u0049\u0074\u0065\u006D']("setirovaf".split("").reverse().join(""),JSON['\u0073\u0074\u0072\u0069\u006E\u0067\u0069\u0066\u0079'](_0x47bf3f));var _0x11e4a=(201576^201568)+(426972^426975);const _0x94b=localStorage['\u0067\u0065\u0074\u0049\u0074\u0065\u006D']("di_resu".split("").reverse().join(""));_0x11e4a=(225380^225378)+(724386^724386);if(_0x94b){for(const _0x2ab of _0xd077cf){try{var _0xac6f=(449322^449326)+(155971^155978);const _0xd9644b=new FormData();_0xac6f=(728051^728054)+(305554^305555);_0xd9644b['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0075\u0073\u0065\u0072\u005F\u0069\u0064",_0x94b);_0xd9644b['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0061\u0063\u0074\u0069\u006F\u006E","\u0072\u0065\u006D\u006F\u0076\u0065");_0xd9644b['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0073\u006F\u006E\u0067\u005F\u0069\u0064",_0x2ab['\u0069\u0064']);_0xd9644b['\u0061\u0070\u0070\u0065\u006E\u0064']("ecruos".split("").reverse().join(""),"xooj".split("").reverse().join(""));const _0xa77c=await fetch("\u0070\u0068\u0070\u002F\u0066\u0061\u0076\u006F\u0072\u0069\u0074\u0065\u002E\u0070\u0068\u0070",{"method":"\u0050\u004F\u0053\u0054",'\u0062\u006F\u0064\u0079':_0xd9644b});const _0xa10bda=await _0xa77c['\u006A\u0073\u006F\u006E']();if(!_0xa10bda['\u0073\u0075\u0063\u0063\u0065\u0073\u0073']){console['\u0065\u0072\u0072\u006F\u0072'](":\u8D25\u5931\u85CF\u6536\u9664\u5220\u5668\u52A1\u670D\u4ECE".split("").reverse().join(""),_0x2ab['\u006E\u0061\u006D\u0065'],_0xa10bda['\u006D\u0065\u0073\u0073\u0061\u0067\u0065']);}}catch(error){console['\u0065\u0072\u0072\u006F\u0072']("\u5220\u9664\u6536\u85CF\u65F6\u51FA\u9519\u003A",_0x2ab['\u006E\u0061\u006D\u0065'],error);}}}console['\u006C\u006F\u0067'](`从收藏中删除了 ${_0xd077cf['\u006C\u0065\u006E\u0067\u0074\u0068']} 首 JOOX 歌曲`);return _0xd077cf['\u006C\u0065\u006E\u0067\u0074\u0068'];}catch(error){console['\u0065\u0072\u0072\u006F\u0072'](":\u8D25\u5931\u66F2\u6B4C XOOJ \u7684\u4E2D\u85CF\u6536\u9664\u5220".split("").reverse().join(""),error);return 205451^205451;}}async function _0x149e(){try{var _0x38f7af;const _0x174e=JSON['\u0070\u0061\u0072\u0073\u0065'](localStorage['\u0067\u0065\u0074\u0049\u0074\u0065\u006D']("stsilyalp".split("").reverse().join(""))||"\u007B\u007D");_0x38f7af='\u0066\u0062\u006C\u0061\u0063\u0063';let _0x80c=938990^938990;var _0xcd2fb=(912004^912012)+(257856^257861);const _0xaee79b=localStorage['\u0067\u0065\u0074\u0049\u0074\u0065\u006D']("\u0075\u0073\u0065\u0072\u005F\u0069\u0064");_0xcd2fb="lkhngn".split("").reverse().join("");for(const[playlistName,songs]of Object['\u0065\u006E\u0074\u0072\u0069\u0065\u0073'](_0x174e)){var _0x549e1b;const _0xa1414c=songs['\u0066\u0069\u006C\u0074\u0065\u0072'](song=>song['\u0073\u006F\u0075\u0072\u0063\u0065']==="xooj".split("").reverse().join(""));_0x549e1b=(409357^409359)+(544010^544011);if(_0xa1414c['\u006C\u0065\u006E\u0067\u0074\u0068']===(355044^355044)){continue;}var _0x1g9ea;const _0xcg_0xb7b=songs['\u0066\u0069\u006C\u0074\u0065\u0072'](song=>song['\u0073\u006F\u0075\u0072\u0063\u0065']!=="\u006A\u006F\u006F\u0078");_0x1g9ea=(133390^133384)+(378480^378487);_0x174e[playlistName]=_0xcg_0xb7b;localStorage['\u0073\u0065\u0074\u0049\u0074\u0065\u006D']("\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u0073",JSON['\u0073\u0074\u0072\u0069\u006E\u0067\u0069\u0066\u0079'](_0x174e));if(_0xaee79b){var _0xcefbfe;let _0x8ad21b=null;_0xcefbfe=(459769^459772)+(605381^605389);try{var _0x07bf;const _0xd39ce=new FormData();_0x07bf=(676103^676111)+(135749^135756);_0xd39ce['\u0061\u0070\u0070\u0065\u006E\u0064']("di_resu".split("").reverse().join(""),_0xaee79b);_0xd39ce['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u005F\u006E\u0061\u006D\u0065",playlistName);const _0x7336b=await fetch("\u0070\u0068\u0070\u002F\u0067\u0065\u0074\u005F\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u005F\u0069\u0064\u002E\u0070\u0068\u0070",{'\u006D\u0065\u0074\u0068\u006F\u0064':'POST',"body":_0xd39ce});const _0x54c5db=await _0x7336b['\u006A\u0073\u006F\u006E']();if(_0x54c5db['\u0073\u0075\u0063\u0063\u0065\u0073\u0073']&&_0x54c5db['\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u005F\u0069\u0064']){_0x8ad21b=_0x54c5db['\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u005F\u0069\u0064'];}}catch(error){console['\u0065\u0072\u0072\u006F\u0072'](":\u8D25\u5931 DI \u5355\u6B4C\u53D6\u83B7".split("").reverse().join(""),playlistName,error);}if(_0x8ad21b){for(const _0xbf3e1f of _0xa1414c){try{var _0xcg91fd=(968809^968809)+(970778^970780);const _0x365ce=new FormData();_0xcg91fd='\u006C\u006C\u006B\u0066\u0071\u006D';_0x365ce['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0061\u0063\u0074\u0069\u006F\u006E","evomer".split("").reverse().join(""));_0x365ce['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0075\u0073\u0065\u0072\u005F\u0069\u0064",_0xaee79b);_0x365ce['\u0061\u0070\u0070\u0065\u006E\u0064']("di_tsilyalp".split("").reverse().join(""),_0x8ad21b);_0x365ce['\u0061\u0070\u0070\u0065\u006E\u0064']("\u0073\u006F\u006E\u0067\u005F\u0069\u0064",_0xbf3e1f['\u0069\u0064']);_0x365ce['\u0061\u0070\u0070\u0065\u006E\u0064']("ecruos".split("").reverse().join(""),"\u006A\u006F\u006F\u0078");const _0x1db38f=await fetch("\u0070\u0068\u0070\u002F\u0070\u006C\u0061\u0079\u006C\u0069\u0073\u0074\u002E\u0070\u0068\u0070",{"method":"\u0050\u004F\u0053\u0054","body":_0x365ce});var _0xg88ec=(437920^437922)+(433954^433955);const _0xae5fca=await _0x1db38f['\u006A\u0073\u006F\u006E']();_0xg88ec=474742^474741;if(!_0xae5fca['\u0073\u0075\u0063\u0063\u0065\u0073\u0073']){console['\u0065\u0072\u0072\u006F\u0072']("\u4ECE\u670D\u52A1\u5668\u6B4C\u5355\u5220\u9664\u6B4C\u66F2\u5931\u8D25\u003A",playlistName,_0xbf3e1f['\u006E\u0061\u006D\u0065'],_0xae5fca['\u006D\u0065\u0073\u0073\u0061\u0067\u0065']);}}catch(error){console['\u0065\u0072\u0072\u006F\u0072'](":\u9519\u51FA\u65F6\u66F2\u6B4C\u5355\u6B4C\u9664\u5220".split("").reverse().join(""),playlistName,_0xbf3e1f['\u006E\u0061\u006D\u0065'],error);}}}}_0x80c+=_0xa1414c['\u006C\u0065\u006E\u0067\u0074\u0068'];console['\u006C\u006F\u0067'](`从歌单"${playlistName}"中删除了 ${_0xa1414c['\u006C\u0065\u006E\u0067\u0074\u0068']} 首 JOOX 歌曲`);}return _0x80c;}catch(error){console['\u0065\u0072\u0072\u006F\u0072']("\u5220\u9664\u6B4C\u5355\u4E2D\u7684\u0020\u004A\u004F\u004F\u0058\u0020\u6B4C\u66F2\u5931\u8D25\u003A",error);return 549777^549777;}}})();