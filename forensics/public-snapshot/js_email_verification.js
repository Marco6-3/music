class EmailVerifier{constructor(){this['\u0075\u0073\u0065\u0072\u0049\u0064']=null;this['\u0065\u006D\u0061\u0069\u006C']=null;this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']=null;this['\u006D\u006F\u0064\u0061\u006C\u0045\u006C\u0065\u006D\u0065\u006E\u0074']=null;this['\u0069\u006E\u0069\u0074']();}init(){this['\u0063\u0072\u0065\u0061\u0074\u0065\u004D\u006F\u0064\u0061\u006C']();this['\u0062\u0069\u006E\u0064\u0045\u0076\u0065\u006E\u0074\u0073']();}createModal(){if(document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u0065\u006D\u0061\u0069\u006C\u0056\u0065\u0072\u0069\u0066\u0069\u0063\u0061\u0074\u0069\u006F\u006E\u004D\u006F\u0064\u0061\u006C")){return;}var _0xbf02d;const modalHtml=`
            <div class="modal" id="emailVerificationModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">邮箱验证</h5>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            系统检测到您注册时的邮箱可能有误，请验证您的邮箱。若无需修改，请点击发送验证码验证您当前邮箱。
                        </div>
                        
                        <div class="form-group">
                            <label for="currentEmail" class="form-label">当前邮箱</label>
                            <input type="email" class="form-control" id="currentEmail" readonly>
                        </div>
                        
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="changeEmailCheck">
                            <label class="form-check-label" for="changeEmailCheck">
                                我需要修改邮箱
                            </label>
                        </div>
                        
                        <div class="form-group" id="newEmailGroup" style="display:none;">
                            <label for="newEmail" class="form-label">新邮箱</label>
                            <input type="email" class="form-control" id="newEmail" placeholder="请输入新邮箱地址">
                            <div class="form-text">请确保输入正确的邮箱地址，验证码将发送到这个邮箱</div>
                        </div>
                        
                        <div class="verification-code-group" id="verificationCodeGroup">
                            <div class="verification-input-group">
                                <label for="verificationCode" class="form-label">验证码</label>
                                <div class="verification-input-container">
                                    <input type="text" class="verification-input" id="verificationCode" placeholder="请输入验证码">
                                    <button class="verification-btn" id="sendVerificationCode">发送验证码</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="verify-result" id="verifyResult"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-primary" id="verifyEmailBtn" disabled>验证邮箱</button>
                    </div>
                </div>
            </div>
        `;_0xbf02d='\u0062\u006B\u006C\u0064\u0061\u0068';var _0x018fbd;const style=document['\u0063\u0072\u0065\u0061\u0074\u0065\u0045\u006C\u0065\u006D\u0065\u006E\u0074']("\u0073\u0074\u0079\u006C\u0065");_0x018fbd=(508055^508055)+(149050^149048);style['\u0074\u0065\u0078\u0074\u0043\u006F\u006E\u0074\u0065\u006E\u0074']=`
            #emailVerificationModal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.7);
                z-index: 10000;
                display: none;
                justify-content: center;
                align-items: center;
                overflow-y: auto;
            }
            
            #emailVerificationModal .modal-content {
                background-color: #fff;
                border-radius: 8px;
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            
            #emailVerificationModal .modal-header {
                padding: 15px;
                border-bottom: 1px solid #e9e9e9;
            }
            
            #emailVerificationModal .modal-title {
                margin: 0;
                font-size: 18px;
                font-weight: bold;
            }
            
            #emailVerificationModal .modal-body {
                padding: 15px;
            }
            
            #emailVerificationModal .modal-footer {
                padding: 15px;
                border-top: 1px solid #e9e9e9;
                text-align: right;
            }
            
            #emailVerificationModal .alert {
                padding: 10px;
                margin-bottom: 15px;
                border-radius: 4px;
            }
            
            #emailVerificationModal .alert-warning {
                background-color: #fff3cd;
                color: #856404;
                border: 1px solid #ffeeba;
            }
            
            #emailVerificationModal .alert-danger {
                background-color: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            
            #emailVerificationModal .alert-success {
                background-color: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            #emailVerificationModal .form-group {
                margin-bottom: 15px;
            }
            
            #emailVerificationModal .form-label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
            }
            
            #emailVerificationModal .form-control {
                width: 100%;
                padding: 8px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                font-size: 16px;
            }
            
            #emailVerificationModal .form-text {
                margin-top: 5px;
                font-size: 12px;
                color: #6c757d;
            }
            
            #emailVerificationModal .form-check {
                display: flex;
                align-items: center;
                margin-bottom: 15px;
            }
            
            #emailVerificationModal .form-check-input {
                margin-right: 5px;
            }
            
            #emailVerificationModal .verification-code-group {
                margin-bottom: 15px;
            }
            
            #emailVerificationModal .verification-input-container {
                display: flex;
                gap: 10px;
            }
            
            #emailVerificationModal .verification-input {
                flex: 1;
                padding: 8px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                font-size: 16px;
            }
            
            #emailVerificationModal .verification-btn {
                padding: 8px 15px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            #emailVerificationModal .verification-btn:hover {
                background-color: #0069d9;
            }
            
            #emailVerificationModal .verification-btn:disabled {
                background-color: #6c757d;
                cursor: not-allowed;
            }
            
            #emailVerificationModal .btn-primary {
                padding: 8px 15px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            #emailVerificationModal .btn-primary:hover {
                background-color: #0069d9;
            }
            
            #emailVerificationModal .btn-primary:disabled {
                background-color: #6c757d;
                cursor: not-allowed;
            }
            
            #emailVerificationModal .btn-secondary {
                padding: 8px 15px;
                background-color: #6c757d;
                color: white;
                border: none;
                border-radius: 4px;
                margin-right: 10px;
                cursor: pointer;
            }
            
            #emailVerificationModal .btn-secondary:hover {
                background-color: #5a6268;
            }
            
            #emailVerificationModal .verify-result {
                margin-top: 15px;
            }
            
            /* 适配深色模式 */
            [data-theme="dark"] #emailVerificationModal .modal-content {
                background-color: #333;
                color: #f8f9fa;
            }
            
            [data-theme="dark"] #emailVerificationModal .modal-header,
            [data-theme="dark"] #emailVerificationModal .modal-footer {
                border-color: #444;
            }
            
            [data-theme="dark"] #emailVerificationModal .form-control {
                background-color: #444;
                color: #f8f9fa;
                border-color: #666;
            }
            
            [data-theme="dark"] #emailVerificationModal .form-text {
                color: #adb5bd;
            }
            
            [data-theme="dark"] #emailVerificationModal .verification-input {
                background-color: #444;
                color: #f8f9fa;
                border-color: #666;
            }
        `;document['\u0068\u0065\u0061\u0064']['\u0061\u0070\u0070\u0065\u006E\u0064\u0043\u0068\u0069\u006C\u0064'](style);var _0x8e_0xee9=(774168^774175)+(553386^553386);const modalContainer=document['\u0063\u0072\u0065\u0061\u0074\u0065\u0045\u006C\u0065\u006D\u0065\u006E\u0074']("\u0064\u0069\u0076");_0x8e_0xee9='\u006B\u0062\u0067\u006D\u0067\u006E';modalContainer['\u0069\u006E\u006E\u0065\u0072\u0048\u0054\u004D\u004C']=modalHtml;document['\u0062\u006F\u0064\u0079']['\u0061\u0070\u0070\u0065\u006E\u0064\u0043\u0068\u0069\u006C\u0064'](modalContainer['\u0066\u0069\u0072\u0073\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0043\u0068\u0069\u006C\u0064']);this['\u006D\u006F\u0064\u0061\u006C\u0045\u006C\u0065\u006D\u0065\u006E\u0074']=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("ladoMnoitacifireVliame".split("").reverse().join(""));}bindEvents(){document['\u0061\u0064\u0064\u0045\u0076\u0065\u006E\u0074\u004C\u0069\u0073\u0074\u0065\u006E\u0065\u0072']("\u0063\u006C\u0069\u0063\u006B",e=>{const target=e['\u0074\u0061\u0072\u0067\u0065\u0074'];if(target['\u0069\u0064']==="\u0073\u0065\u006E\u0064\u0056\u0065\u0072\u0069\u0066\u0069\u0063\u0061\u0074\u0069\u006F\u006E\u0043\u006F\u0064\u0065"){this['\u0073\u0065\u006E\u0064\u0056\u0065\u0072\u0069\u0066\u0069\u0063\u0061\u0074\u0069\u006F\u006E\u0043\u006F\u0064\u0065']();}if(target['\u0069\u0064']==="ntBliamEyfirev".split("").reverse().join("")){this['\u0076\u0065\u0072\u0069\u0066\u0079\u0045\u006D\u0061\u0069\u006C']();}});document['\u0061\u0064\u0064\u0045\u0076\u0065\u006E\u0074\u004C\u0069\u0073\u0074\u0065\u006E\u0065\u0072']("egnahc".split("").reverse().join(""),e=>{if(e['\u0074\u0061\u0072\u0067\u0065\u0074']['\u0069\u0064']==="\u0063\u0068\u0061\u006E\u0067\u0065\u0045\u006D\u0061\u0069\u006C\u0043\u0068\u0065\u0063\u006B"){document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("puorGliamEwen".split("").reverse().join(""))['\u0073\u0074\u0079\u006C\u0065']['\u0064\u0069\u0073\u0070\u006C\u0061\u0079']=e['\u0074\u0061\u0072\u0067\u0065\u0074']['\u0063\u0068\u0065\u0063\u006B\u0065\u0064']?"\u0062\u006C\u006F\u0063\u006B":"\u006E\u006F\u006E\u0065";}});document['\u0061\u0064\u0064\u0045\u0076\u0065\u006E\u0074\u004C\u0069\u0073\u0074\u0065\u006E\u0065\u0072']("\u0069\u006E\u0070\u0075\u0074",e=>{if(e['\u0074\u0061\u0072\u0067\u0065\u0074']['\u0069\u0064']==="edoCnoitacifirev".split("").reverse().join("")){document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("ntBliamEyfirev".split("").reverse().join(""))['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=e['\u0074\u0061\u0072\u0067\u0065\u0074']['\u0076\u0061\u006C\u0075\u0065']['\u006C\u0065\u006E\u0067\u0074\u0068']<(483523^483525);}});}show(userId,email){this['\u0075\u0073\u0065\u0072\u0049\u0064']=userId;this['\u0065\u006D\u0061\u0069\u006C']=email;this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']=null;document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u0063\u0075\u0072\u0072\u0065\u006E\u0074\u0045\u006D\u0061\u0069\u006C")['\u0076\u0061\u006C\u0075\u0065']=email;document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u0063\u0068\u0061\u006E\u0067\u0065\u0045\u006D\u0061\u0069\u006C\u0043\u0068\u0065\u0063\u006B")['\u0063\u0068\u0065\u0063\u006B\u0065\u0064']=false;document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C\u0047\u0072\u006F\u0075\u0070")['\u0073\u0074\u0079\u006C\u0065']['\u0064\u0069\u0073\u0070\u006C\u0061\u0079']="\u006E\u006F\u006E\u0065";document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("tluseRyfirev".split("").reverse().join(""))['\u0069\u006E\u006E\u0065\u0072\u0048\u0054\u004D\u004C']='';document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("ntBliamEyfirev".split("").reverse().join(""))['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=!![];if(document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u0076\u0065\u0072\u0069\u0066\u0069\u0063\u0061\u0074\u0069\u006F\u006E\u0043\u006F\u0064\u0065")){document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u0076\u0065\u0072\u0069\u0066\u0069\u0063\u0061\u0074\u0069\u006F\u006E\u0043\u006F\u0064\u0065")['\u0076\u0061\u006C\u0075\u0065']='';}if(document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C")){document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C")['\u0076\u0061\u006C\u0075\u0065']='';}if(this['\u006D\u006F\u0064\u0061\u006C\u0045\u006C\u0065\u006D\u0065\u006E\u0074']){this['\u006D\u006F\u0064\u0061\u006C\u0045\u006C\u0065\u006D\u0065\u006E\u0074']['\u0073\u0074\u0079\u006C\u0065']['\u0064\u0069\u0073\u0070\u006C\u0061\u0079']="\u0066\u006C\u0065\u0078";}}hide(){if(this['\u006D\u006F\u0064\u0061\u006C\u0045\u006C\u0065\u006D\u0065\u006E\u0074']){this['\u006D\u006F\u0064\u0061\u006C\u0045\u006C\u0065\u006D\u0065\u006E\u0074']['\u0073\u0074\u0079\u006C\u0065']['\u0064\u0069\u0073\u0070\u006C\u0061\u0079']="\u006E\u006F\u006E\u0065";}}sendVerificationCode(){if(!this['\u0075\u0073\u0065\u0072\u0049\u0064']){this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072']("\u8BD5\u91CD\u9762\u9875\u65B0\u5237\u8BF7\uFF0C\u6548\u65E0DI\u6237\u7528".split("").reverse().join(""));return;}var _0x656g;const useNewEmail=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u0063\u0068\u0061\u006E\u0067\u0065\u0045\u006D\u0061\u0069\u006C\u0043\u0068\u0065\u0063\u006B")['\u0063\u0068\u0065\u0063\u006B\u0065\u0064'];_0x656g='\u0062\u0066\u0065\u006E\u0063\u006E';const targetEmail=useNewEmail?document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C")['\u0076\u0061\u006C\u0075\u0065']:this['\u0065\u006D\u0061\u0069\u006C'];if(useNewEmail&&!this['\u0076\u0061\u006C\u0069\u0064\u0061\u0074\u0065\u0045\u006D\u0061\u0069\u006C'](targetEmail)){this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072']("\u5740\u5730\u7BB1\u90AE\u7684\u6548\u6709\u5165\u8F93\u8BF7".split("").reverse().join(""));return;}if(useNewEmail){this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']=targetEmail;}else{this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']=null;}var _0x9gf79e;const sendBtn=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("edoCnoitacifireVdnes".split("").reverse().join(""));_0x9gf79e='\u0065\u0069\u006F\u006B\u006A\u0064';sendBtn['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=!![];sendBtn['\u0069\u006E\u006E\u0065\u0072\u0054\u0065\u0078\u0074']="...\u4E2D\u9001\u53D1".split("").reverse().join("");fetch("\u002E\u002E\u002F\u0070\u0068\u0070\u002F\u0076\u0065\u0072\u0069\u0066\u0079\u005F\u0065\u006D\u0061\u0069\u006C\u002E\u0070\u0068\u0070",{"method":"\u0050\u004F\u0053\u0054",'\u0068\u0065\u0061\u0064\u0065\u0072\u0073':{"\u0043\u006F\u006E\u0074\u0065\u006E\u0074\u002D\u0054\u0079\u0070\u0065":'application/x-www-form-urlencoded'},"body":`action=send_code&user_id=${this['\u0075\u0073\u0065\u0072\u0049\u0064']}${this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']?"=liame_pmet&".split("").reverse().join("")+encodeURIComponent(this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']):''}`})['\u0074\u0068\u0065\u006E'](response=>response['\u006A\u0073\u006F\u006E']())['\u0074\u0068\u0065\u006E'](data=>{if(data['\u0073\u0075\u0063\u0063\u0065\u0073\u0073']){this['\u0073\u0068\u006F\u0077\u0053\u0075\u0063\u0063\u0065\u0073\u0073'](data['\u006D\u0065\u0073\u0073\u0061\u0067\u0065']);}else{this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072'](data['\u006D\u0065\u0073\u0073\u0061\u0067\u0065']||"\u8D25\u5931\u7801\u8BC1\u9A8C\u9001\u53D1".split("").reverse().join(""));}sendBtn['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=false;sendBtn['\u0069\u006E\u006E\u0065\u0072\u0054\u0065\u0078\u0074']="\u7801\u8BC1\u9A8C\u9001\u53D1".split("").reverse().join("");})['\u0063\u0061\u0074\u0063\u0068'](error=>{console['\u0065\u0072\u0072\u006F\u0072'](":rorrE".split("").reverse().join(""),error);this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072']("\u8BD5\u91CD\u540E\u7A0D\u8BF7\uFF0C\u8D25\u5931\u6C42\u8BF7".split("").reverse().join(""));sendBtn['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=false;sendBtn['\u0069\u006E\u006E\u0065\u0072\u0054\u0065\u0078\u0074']="\u53D1\u9001\u9A8C\u8BC1\u7801";});}verifyEmail(){const verificationCode=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("edoCnoitacifirev".split("").reverse().join(""))['\u0076\u0061\u006C\u0075\u0065'];if(!verificationCode){this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072']("\u8BF7\u8F93\u5165\u9A8C\u8BC1\u7801");return;}const verifyBtn=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("ntBliamEyfirev".split("").reverse().join(""));verifyBtn['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=!![];verifyBtn['\u0069\u006E\u006E\u0065\u0072\u0054\u0065\u0078\u0074']="\u9A8C\u8BC1\u4E2D\u002E\u002E\u002E";var _0x33f=(540301^540303)+(115765^115772);const requestParams=new URLSearchParams({'\u0061\u0063\u0074\u0069\u006F\u006E':"\u0076\u0065\u0072\u0069\u0066\u0079\u005F\u0063\u006F\u0064\u0065","user_id":this['\u0075\u0073\u0065\u0072\u0049\u0064'],"code":verificationCode});_0x33f="bdqegk".split("").reverse().join("");if(this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']){requestParams['\u0061\u0070\u0070\u0065\u006E\u0064']("\u006E\u0065\u0077\u005F\u0065\u006D\u0061\u0069\u006C",this['\u006E\u0065\u0077\u0045\u006D\u0061\u0069\u006C']);}fetch("php.liame_yfirev/php/..".split("").reverse().join(""),{'\u006D\u0065\u0074\u0068\u006F\u0064':'POST','\u0068\u0065\u0061\u0064\u0065\u0072\u0073':{"\u0043\u006F\u006E\u0074\u0065\u006E\u0074\u002D\u0054\u0079\u0070\u0065":'application/x-www-form-urlencoded'},"body":requestParams})['\u0074\u0068\u0065\u006E'](response=>response['\u006A\u0073\u006F\u006E']())['\u0074\u0068\u0065\u006E'](data=>{if(data['\u0073\u0075\u0063\u0063\u0065\u0073\u0073']){this['\u0073\u0068\u006F\u0077\u0053\u0075\u0063\u0063\u0065\u0073\u0073']("\uFF01\u529F\u6210\u8BC1\u9A8C\u7BB1\u90AE".split("").reverse().join(""));if(data['\u0061\u0075\u0074\u006F\u005F\u006C\u006F\u0067\u0069\u006E']&&data['\u0074\u006F\u006B\u0065\u006E']&&data['\u0075\u0073\u0065\u0072']){localStorage['\u0073\u0065\u0074\u0049\u0074\u0065\u006D']("\u0061\u0075\u0074\u0068\u005F\u0074\u006F\u006B\u0065\u006E",data['\u0074\u006F\u006B\u0065\u006E']);localStorage['\u0073\u0065\u0074\u0049\u0074\u0065\u006D']("\u0075\u0073\u0065\u0072\u005F\u0069\u0064",data['\u0075\u0073\u0065\u0072']['\u0069\u0064']);localStorage['\u0073\u0065\u0074\u0049\u0074\u0065\u006D']("\u0075\u0073\u0065\u0072\u006E\u0061\u006D\u0065",data['\u0075\u0073\u0065\u0072']['\u0075\u0073\u0065\u0072\u006E\u0061\u006D\u0065']);setTimeout(()=>{this['\u0068\u0069\u0064\u0065']();location['\u0072\u0065\u006C\u006F\u0061\u0064']();},934261^935589);}else{setTimeout(()=>{this['\u0068\u0069\u0064\u0065']();location['\u0072\u0065\u006C\u006F\u0061\u0064']();},272102^273758);}}else{this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072'](data['\u006D\u0065\u0073\u0073\u0061\u0067\u0065']||"\u9A8C\u8BC1\u5931\u8D25");verifyBtn['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=false;verifyBtn['\u0069\u006E\u006E\u0065\u0072\u0054\u0065\u0078\u0074']="\u7BB1\u90AE\u8BC1\u9A8C".split("").reverse().join("");}})['\u0063\u0061\u0074\u0063\u0068'](error=>{console['\u0065\u0072\u0072\u006F\u0072'](":rorrE".split("").reverse().join(""),error);this['\u0073\u0068\u006F\u0077\u0045\u0072\u0072\u006F\u0072']("\u8BD5\u91CD\u540E\u7A0D\u8BF7\uFF0C\u8D25\u5931\u6C42\u8BF7".split("").reverse().join(""));verifyBtn['\u0064\u0069\u0073\u0061\u0062\u006C\u0065\u0064']=false;verifyBtn['\u0069\u006E\u006E\u0065\u0072\u0054\u0065\u0078\u0074']="\u9A8C\u8BC1\u90AE\u7BB1";});}showError(message){const resultElement=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("tluseRyfirev".split("").reverse().join(""));resultElement['\u0069\u006E\u006E\u0065\u0072\u0048\u0054\u004D\u004C']=`<div class="alert alert-danger">${message}</div>`;}showSuccess(message){var _0x9e8a=(446736^446737)+(695832^695837);const resultElement=document['\u0067\u0065\u0074\u0045\u006C\u0065\u006D\u0065\u006E\u0074\u0042\u0079\u0049\u0064']("tluseRyfirev".split("").reverse().join(""));_0x9e8a='\u0063\u0068\u0070\u006D\u006E\u0064';resultElement['\u0069\u006E\u006E\u0065\u0072\u0048\u0054\u004D\u004C']=`<div class="alert alert-success">${message}</div>`;}validateEmail(email){var _0x50bc;const re=new RegExp('\u005E\u0028\u0028\u005B\u005E\u003C\u003E\u0028\u0029\u005B\u005C\u005D\u005C\u005C\u002E\u002C\u003B\u003A\u005C\u0073\u0040\u0022\u005D\u002B\u0028\u005C\u002E\u005B\u005E\u003C\u003E\u0028\u0029\u005B\u005C\u005D\u005C\u005C\u002E\u002C\u003B\u003A\u005C\u0073\u0040\u0022\u005D\u002B\u0029\u002A\u0029\u007C\u0028\u0022\u002E\u002B\u0022\u0029\u0029\u0040\u0028\u0028\u005C\u005B\u005B\u0030\u002D\u0039\u005D\u007B\u0031\u002C\u0033\u007D\u005C\u002E\u005B\u0030\u002D\u0039\u005D\u007B\u0031\u002C\u0033\u007D\u005C\u002E\u005B\u0030\u002D\u0039\u005D\u007B\u0031\u002C\u0033\u007D\u005C\u002E\u005B\u0030\u002D\u0039\u005D\u007B\u0031\u002C\u0033\u007D\u005C\u005D\u0029\u007C\u0028\u0028\u005B\u0061\u002D\u007A\u0041\u002D\u005A\u005C\u002D\u0030\u002D\u0039\u005D\u002B\u005C\u002E\u0029\u002B\u005B\u0061\u002D\u007A\u0041\u002D\u005A\u005D\u007B\u0032\u002C\u007D\u0029\u0029\u0024',"");_0x50bc=661276^661279;return re['\u0074\u0065\u0073\u0074'](String(email)['\u0074\u006F\u004C\u006F\u0077\u0065\u0072\u0043\u0061\u0073\u0065']());}}var _0x2eaab=(113743^113734)+(430680^430681);const emailVerifier=new EmailVerifier();_0x2eaab=(526312^526317)+(532194^532194);window['\u0065\u006D\u0061\u0069\u006C\u0056\u0065\u0072\u0069\u0066\u0069\u0065\u0072']=emailVerifier;