
# Product design

この文書はOshikatsuのプロダクト判断に関する正本である

# Part I: Product Design

## 利用者からみた「Oshikatsu」

> 新しくリリースされた漫画を一緒に集まってみんなで推しつつ、推しの近い仲間を見つけ、仲間経由で面白い漫画を見つけてもっと漫画を読み、さらに沢山の漫画を推して盛り上がる。その盛り上がりを見た別の仲間がもっと推しの漫画を見つけもっともっと盛り上がる

これがOshikatsuの目的である。

いま読んだ人間が同じ限られた時間に驚き、笑い、迷い、泣う、その空気を共有する場所を作る。第一目的は、**今日出た漫画を、今日そこにいる人間たちで楽しく読むこと**である。Oshikatsuは「人間が参加している共有時間」を守る。

みんなで同じ時間を共有し「推し」を共有し合う
```text
毎週特定の曜日の特定時刻に漫画の最新話がリリース
-> 複数漫画の最新話が同時にリリースされる
-> 対応するRoomがOshikatsuでオープン。Roomには複数漫画が入っている
-> 読者達がRoomに集って「推す（＝お互いに感想を述べ合う）」。推す方法は　スタンプ（絵文字のこと。「🔥神回」「😭泣いた」「🥺尊い」「🐉続き召喚」「👑優勝」「💡無事死亡」「🤗溶けた」「🐻‍❄️情緒崩壊」「🌋情緒噴火」など）、叫び（「作者様ありがとうございます!!来週まで生きられない」「神回すぎる!!!!!」「情緒が爆散した」など）。自分の推しや他人の推しやリアルタイムにRoomに反映され、熱狂を作り出す。同じ時間を共有するために、Roomは数時間経過したら封鎖される
-> さらに、みんなの推しは次の熱狂を作り出すために使われる
   ・Roomに自分の推したい漫画がなければ、投票開始前に限りだれでも一つはNomineeとして追加することができる。投票開始後は候補集合を変更しない
    ・漫画リリース後一定時間経つとRoomはSEALされ、その時点で推し数が多い漫画がランキング発表
    ・RoomがSEALされたタイミングで特定の漫画を推した人には実績が付与
        🥇１位達成：Room内で一位になった漫画の特定話を推していた人に付与される
        💎原石発掘：Room内で一位になった漫画をその回で初回に推していた人に付与される
        🔥継続応援：Roomに連続して参加した回数に応じて付与される
        ✏️投票回数：Roomに参加すると付与される
    ・特別なRoomが年に数回開かれる。これは漫画ではなくOshikatsuに参加している人に対する「推し」。このRoomでみんな人に対して推し合う
        🏆ファイナリスト：漫画文化に貢献した人
-> 相互のプロフィールを閲覧し、実績がたくさんある人がRoomで推している漫画を見ることで新しい「推し」を発掘。さらにその漫画を読むことでもっとOshikatsuが捗る
```

良い漫画を布教したい、という誰かの推しが、良い漫画を読みたいと考える人に届く仕組み。
Web2のコメントは複数投稿可能であったり、投稿がノーコストであるために場が荒れやすくまた、そもそも主催者によって結果が操作され出版社が売りたい漫画がランキング上位になるなどの特徴があったり、投票期間を恣意的にひろげたり縮めたり可能だがこれができないために良質な本物のコメントが集まりやすい場になるはずである。

Roomはだれでも開設できる。HackathonのデモではRoom開設用UIからmanifestを作成する。本番でもRoomの開始・終了条件はmanifestの固定`opensAt`と`deadline`で決まり、主催者が後から変更することはできない。

## Hackの観点からみた「Oshikatsu」

> Cryptoを活用したSybil Resistanceな仮名投票システム。World IDのOrb-backed Proof of Human credential issuanceを信頼境界に含め、World ID＋HCSの組み合わせによって、投票Window内にHCS consensusへ到達した投票だけが有効＋特定の人物が最後に実施した投票が有効票として扱われる＋Roomごとに一人一票が成立する＋投票者がOrbで人間証明済みである一方、投票そのものは仮名である（Walletのアドレスは現実世界のIdentityではない）＋集計が第三者でVerifiableで投票の主催者によって結果が操作されていない保証がある＋投票そのものに微量のコストがかかるためランダム投票など意味のない票を排除できる＋公開の場所で誰でも投票を開催でき投票開始前ならだれでも立候補できる　などの民主主義に必須の公正な投票をオンラインで行うための基盤が実現

人間証明から投票成立までは、次の一本の経路に固定する。

```
Hedera Wallet（HashPack）を接続
  -> Room内で投票する漫画のrankを選択したりコメントしたりしてから、確定ボタンを押す
  -> Room・コメントhash・Hedera Walletを束縛したballot hashとWorld signalを生成
  -> そのRoomへの初回投票時に限り、World ID v4による人間証明を取得
   -> World Chainの鮮度条件を満たすanchor blockと公式WorldIDVerifierを使い、proofを投稿前に検証
  -> proofが有効な場合、Wallet本人がraw World proofを含む初回ballotをHCSへ直接投稿
  -> Mirror NodeからHCS messageを取得し、分割されたmessageを完全に再構成
   -> anchor blockがWorld Chainでfinalizedになるまで待つ
  -> 投票時に固定したWorld Chainの同じhistorical stateを使い、第三者もWorld proofを再検証
  -> 同じRoom・同じWorld nullifierについて、HCS上で最初に成立した初回ballotだけにRoom capabilityを付与
  -> capability取得後はWorld IDを再度要求せず、同じHedera Walletから投票の更新・取消をHCSへ投稿
   -> 同じcapabilityについて、manifestのdeadline以前に完了したHCS eventのうち最後のものを正式な投票状態として採用
   -> deadline後にauthority認証済みSEALを投稿し、固定済みdeadlineまでの結果を確定
```
World IDによる人間証明は、各Roomへの初回投票時に一度だけ要求する。

World ID requestにはv4の`proofOfHuman` presetを使い、`allow_legacy_proofs=false`とする。これにより、Orbの匿名生体認証に裏づけられたWorld ID v4 Proof of Human credentialを持つ人だけを初回投票の対象とする。Oshikatsuにおける「人間」「一人一票」は、このWorld credential issuanceと公式World verifierを信頼境界に含めた上で成立する。

Roomは裏側ではそれぞれ独立した投票イベントである。そのためWorld IDは、Oshikatsu全体で恒久的なユーザーIDを作るためではなく、各Roomにおいて一人の人間が投票資格を一つだけ取得するために使用する。

Room A
  -> 初回投票時にWorld IDを一度実施
  -> Room Aのcapabilityを取得
  -> 締切までは同じWalletで何度でも更新・取消可能

Room B
  -> 初回投票時にWorld IDをもう一度実施
  -> Room Bのcapabilityを取得
  -> 締切までは同じWalletで何度でも更新・取消可能

同じRoom内でrankingを変更するたびにWorld IDを要求することはない。World proofは初回のRoom capability取得にのみ使用し、その後の操作権はHedera Walletに固定されたRoom capabilityとして扱う。

このprotocolは次の三原則を守る。

1. World IDは、Roomごとの一人一資格を成立させるために使う。
   各Roomへの初回投票時に一度だけOrb-backed World ID v4 Proof of Humanを要求する。有効なproofを持つ最初の初回ballotにRoom capabilityを付与し、その後の投票更新・取消にはWorld proofを再要求しない。
2. World ChainとHederaの責務を分離する。
    World Chain上の公式WorldIDVerifierは、人間証明とnullifierの正当性を担保する。Hedera Walletは投票者本人の意思を示し、HCSは投稿者、投稿順序、投票更新、取消、締切前後の正本となる。Oshikatsu backendは人間証明のformal validityを署名しない。
3. 無効なproofと、検証できないproofを区別する。
    WorldIDVerifierがproofを拒否した場合はINVALIDとする。一方、historical stateを取得できない、archive RPC間でblock hashが一致しないなど、検証を完了できない場合はUNVERIFIABLEとする。UNVERIFIABLEな初回ballotにはRoom capabilityを付与しない。

初回投票の状態遷移は次のとおりとする。
```
DRAFT
  Room内のrankingを編集中

  -> PROOF_ACQUIRED
     Room・ranking・締切・Walletに束縛されたWorld proofを取得済み

  -> PREFLIGHT_VALID
     World Chainのanchor blockでproofを投稿前検証済み。anchorはまだfinalizedでない場合がある

  -> SUBMITTED
     Wallet本人が初回ballotをHCSへ送信済み

  -> REASSEMBLED
     Mirror NodeからHCS messageを完全に再構成済み

  -> WAITING_WORLD_FINALITY
     投票時に固定したWorld anchor blockがfinalizedになるまで待機中

  -> VALID
     World proof、ballot hash、signal、Hedera payer、締切条件がすべて有効

  -> INVALID
     proof、hash、payer、締切などの検証に失敗

  -> UNVERIFIABLE
     historical stateなどを取得できず、第三者検証を完了できない

  -> CAPABILITY_GRANTED
     VALIDであり、同じRoom・同じnullifierの先行capabilityが存在しない

  -> NULLIFIER_CONFLICT
     VALIDではあるが、同じRoom・同じnullifierのcapabilityがすでに存在
```

VALIDは、初回ballotに含まれるWorld proofと投票情報が正しいことを表す。

CAPABILITY_GRANTEDは、さらにそのRoomにおける一人一資格の条件を満たし、当該Hedera Walletが投票を更新・取消できる状態になったことを表す。

UI上で「投票済み」と表示するのは、HCSへの送信が完了したSUBMITTED時点ではなく、公開検証とnullifier競合判定が完了したCAPABILITY_GRANTED時点とする。

## 投票Windowと候補集合

Room manifestは少なくとも`roomId`、`opensAt`、`deadline`、Nominee一覧、ballot topic、World RP ID、World actionを固定する。

Nomineeの追加は`opensAt`より前にHCS consensusへ到達したeventだけを有効とする。`opensAt`以後のNominee追加はHCSに記録されても公開foldで無効とする。これにより、投票中にrankingの候補集合が変化しない。

初回投票、更新、取消は、logical eventを構成する全chunkが揃い、その最後のchunkが次を満たす場合だけWindow内と判定する。

```text
manifest.opensAt
   <= logical event completion consensus timestamp
   <= manifest.deadline
```

chunkが一つでも欠けているevent、または最後のchunkが`deadline`より後にHCS consensusへ到達したeventは無効とする。締切はSEALの投稿時刻ではなくmanifestの`deadline`で決まる。

## Room固有のWorld action

World v4 nullifierはhuman、RP、actionにscopeされるため、各Roomは固有のactionを使う。

```text
actionText = "oshikatsu-room:" + roomId
action = World IDの公式hash-to-field(UTF8(actionText))
```

`roomId`の代わりにmanifest hashを使う場合は、protocol versionでどちらか一方に固定し、併用しない。RP backendはclientから任意のactionを受け取って署名せず、検証済みmanifestから`actionText`を導出してRP requestへ署名する。これにより、同じ人でもRoomが異なればunlinkableな別nullifierとなり、同じRoomでは同じnullifierとなる。

## World historical anchorの鮮度

historical `eth_call`による再検証は、初回ballotごとに固定したWorld blockを使う。ただしsubmitterが任意に古いblockを選べないよう、次をすべて必須とする。

```text
World block numberから再取得したblock hash == ballotに保存したblock hash
World block timestamp <= logical ballot completion consensus timestamp
logical ballot completion consensus timestamp - World block timestamp <= 300 seconds
capability付与前に、同じWorld block hashがfinalizedになる
```

World ChainはOP Stackであり、hard finalityはEthereum finalityに依存するため、投稿前からfinalizedしているblockを300秒以内に限定すると通常は両立しない。そこで300秒はHCS投稿時点におけるanchorの鮮度条件とし、finalityは投稿後、`CAPABILITY_GRANTED`より前に確認する。finality待ちの間は`WAITING_WORLD_FINALITY`であり、投票済みとして数えない。finalized前にanchor blockがcanonical chainから外れた場合、その初回ballotは無効とする。

300秒はWorld RP requestの標準TTLに揃えたprotocol定数とする。将来変更する場合はmanifestとprotocol versionで固定する。`expiresAtMin`はcredentialの実際の有効期限ではなく、credentialが少なくともその時刻より後まで有効であることの下限として別に検証する。

再検証時は同じblockにおけるWorldIDVerifier proxy addressだけでなく、ERC-1967 implementation、依存registry、Groth16 verifier、各runtime code hashも照合する。最低2つの独立archive providerを使用し、本番では自前archive nodeをその一つに含める。 

## SEAL

SEALはmanifestの`deadline`を変更せず、deadlineまでに成立した公開foldの結果をcommitする。SEAL payload、Room、manifest hash、cutoff sequence、authorityのHedera payerまたは署名を検証する。SEALが遅れても、deadline後の投票が有効になることはない。

Hedera Schedule Serviceは現行仕様上`ConsensusSubmitMessage`をscheduled transactionとして扱えない。そのため、HCS SEALに`scheduled=true`や`scheduleRef == manifest.sealScheduleId`を要求しない。SEALをHederaのscheduled executionへ結びつける必要がある場合は、scheduled `ContractExecuteTransaction`で別のHedera smart contractへseal stateを書き込み、そのcontract recordの`scheduleRef`を検証する別protocolとする。この場合もHCS SEAL message自体は通常投稿であり、両者のhash参照を明示的に結びつける必要がある。

## HCS open-submitの制約

HCS open-submit topicは、期限後の投稿をnetwork入口では拒否しない。期限後のballot、更新、取消、Nominee追加もHCS履歴には残り得るが、公開foldはmanifestの`opensAt`と`deadline`を使って無効化する。

したがって「投票Windowの間だけ投稿可能」ではなく、正確なformal ruleは次である。

> 投票Window内にlogical eventの全chunkがHCS consensusへ到達したeventだけが有効である。


# Part II: 画面定義

画面は、利用者がいま何を感じ、何を決め、次にどこへ進むかを中心に設計する。各画面は必要なデータを受け取り、利用者の選択または確認結果を次の画面へ渡す。通信方式、URL構造、component library、細かな寸法はCoding工程で決定する。


## Reader App

### 画面名：（全画面共通）

この画面ですること：
    全画面にいつも表示されている領域の記述用

- 領域名：グローバルナビゲーション
    - 領域の目的や機能： 画面下部にいつもいるアイコン＋画面名のボタン。画面間を移動するためのもの
    - 領域のデザインのテイスト： ダークモード＋ネオンカラー
    - 内部にある部品
        - `Home`：ホーム画面を表示する
        - `Rankings`：Roomのrankingと結果を表示する
        - `My Shelf`：登録作品と次の推しを表示する
        - `Profile`：仮名profile、実績、Room作成を表示する

    navigation項目と順序は全画面で固定する。現在地はlabel、icon、accent colorの組で示し、colorだけに依存しない。

### 画面名：ホーム

この画面ですること：
    初回登録の開始画面。登録後は、次のRoomが開く時間と参加できる漫画の気配を伝え、読者を共有時間へ招く起点になる場所。新刊発売日の高揚感。ライブ会場のイメージを伝える重要な画面

- 領域名：推し活を始める
    - 領域の目的や機能：初回登録前にWallet登録に進むためのボタンを表示する場所
    - 領域のデザインのテイスト：ライブ会場へ入る一つの強いCTAとして、背景の熱量から明確に分離する
    - 内部にある部品
        - `Start My Oshikatsu`：Wallet接続へ進む。接続後はMy Shelfの初回設定を経てホームへ戻る
        - `Browse First`：Walletを接続せず、公開中のRoomを見る

- 領域名：Room一覧
    - Room名と現在の状況を示すボタンが、複数並んでいて、現在Voteを受付中のRoomが一番上。次にこれから始まる開始前のRoomが並んでいる
    - 押すとそのRoom（ライブ会場）に入る

- 領域名：SpecialRoomの入口
    - 領域の目的や機能：漫画文化へ貢献したReaderを候補として見て、人への推しをformal ballotとして表す。ソシャゲの期間限定イベントのようにホームに表示される。通常Roomとは別領域にこれが表示される
    - 領域のデザインのテイスト：ソシャゲの期間限定イベントのバナー。特別なイベント感のある場所。年数回の祝祭。通常Roomより ceremonialな表現
    - 内部にある部品
        - Room: 
            - Roomタイトル：参加する共有時間を識別する。例：`Manga Culture Contribution Award`として今回の特別Roomを識別する
            - Roomに入る：Roomへのprimary CTA。phaseに応じてメッセージが切り替わる
            - Groove Level：現在のReactionとShoutの勢いを示す。
            - Fans in the Lobby：Roomを閲覧中の規模を示すpresence count
            - Vote deadline：`Voting Closes In`として投票期限を示す

### 画面名：Room画面

この画面ですること：
    推し活のライブ会場

- 領域名：通常Room内部
    - 領域名： 投票開始前画面
        - 領域の目的や機能：Roomのタイトル（本日の推し活）、開幕までを表示する。Roomが開くのを待つ画面。「本日の推し活、開幕まで」「みんな、準備はいいか?」との表示があり高揚させる。ライブイベントの開演時計。時間を第一視線に置く
        - 領域のデザインのテイスト：新刊発売日の高揚感。ライブ会場のイメージ
        - 内部にある部品
            - Roomタイトル：今週参加する共有時間を識別する。例：`Weekly Chapter Drop`
            - Roomに入る：Roomへのprimary CTA。phaseに応じて`Join the Groove`、`Enter the Lobby`、`Replay the Room`を切り替える。中に入るとRoom内部を表示する
            - Groove Level：現在のReactionとShoutの勢いを示す
            - Fans in the Lobby：Roomを閲覧中の規模を示すpresence count
            - Vote deadline：`Voting Closes In`として投票期限を示す
            - 作品一覧
                - 領域名：作品一覧を表維持
                - 領域名：一作品を推薦
                    - 領域の目的や機能：Readerが推したい作品の情報を入力し、Nominee eventを作る
                    - 領域のデザインのテイスト：投稿フォームより推薦カードの作成体験を優先する
                    - 内部にある部品
                        - 漫画情報：title、chapter、cover、reading locationを入力する
                        - Nominee preview：Room内での見え方を確認する
                        - Nominate action：`Review Nomination`からWallet署名へ渡すNominee intentを作る
                        - Window notice：`Nominations lock when the Room opens.`
    - 領域名： 投票中画面
        - 領域名：VotingLineup
            - 領域の目的や機能：manifestに固定された作品を一覧する
            - 領域のデザインのテイスト：週刊誌の目次と書店の新刊台を組み合わせる
            - 内部にある部品
                - Lineup：cover stackと`Tonight's Lineup`で候補作品の全体像を伝える
                - Locked state：`Lineup Locked`を表示する
                - `Open Groove`：作品のGrooveへ進む。これだけではformal ballotを変更しない
        - 領域名：VotingStatus
            - 領域の目的や機能：選んだ作品のGroove（他の人のスタンプや叫びの勢い）を表示する
            - 領域のデザインのテイスト：みんなが作品の周りに集まっている画面。作品が中心にあり、周りにみんなのスタンプが囲っている
            - 内部にある部品
                - 領域名：作品hero
                    - 領域の目的や機能：作品、chapter、reading locationを提示する
                    - 領域のデザインのテイスト：表紙をfull-bleedで扱い、作品世界へ入る
                    - 内部にある部品
                        - Cover：作品を視覚的に識別する
                        - Chapter情報：今回の話を識別する
                        - Read action：`Read Official Chapter`で公式reading locationへ進む
                - スタンプごとの投稿数
                    スタンプ名　X人
                - スタンプを押した人数
                - 叫び一覧
                - `Osu!(React & Shout)`
                    - VotingDialogueを表示する。これだけではformal ballotを変更しない
                    - 領域名：VotingDialogue
                        - 領域の目的や機能：スタンプと叫びを選び、Groove eventを作る
                        - 領域のデザインのテイスト：感情の強さを保つ大きなスタンプと短い入力欄
                        - 内部にある部品
                            - Reaction palette：`🔥 Peak Chapter`、`😭 Cried My Eyes Out`、`🥺 Too Precious`、`🐉 Next Chapter Now`、`👑 Chapter of the Week`、`💡 I'm Dead`、`🤗 I Melted`、`🐼 Emotionally Wrecked`、`🌋 I'm Losing It`から選ぶ
                            - Shout input：`Drop your post-chapter scream...`へ短い感想を入力する
                            - Groove action：`Send to the Groove`でwork、Reaction、Shout、accountを束ねたintentを作る
                - `Add to My Top 3`：この作品をranking候補へ加える。追加済みなら`Remove from My Top 3`へ切り替える
    - 領域名：投票後画面VotingRanking
        - 領域の目的や機能：deadlineまでの最後の意思を集計したrankingと、そのRoomのGrooveWaveを見返す。
        - 領域のデザインのテイスト：画面下部に安定して見える強いaction bar
        - 内部にある部品
            - 領域名：今週のranking
                - 領域の目的や機能：順位、point、有効capability数を示す
                - 領域のデザインのテイスト：雑誌の巻頭ランキング。winnerの表紙を大きく扱う
                - 内部にある部品
                    - Winner feature：`Tonight's Winner`として一位作品を示す
                    - Final Ranking：全作品の順位とpointを示す
                    - Verification summary：`Verified Ballots`、cutoff、accepted ballot数を要約する
                    - Verify Results：manifest hash、result hash、public replayへ進む


- 領域名：特別Room内部
    - 領域名：Special Room hero
        - 領域の目的や機能：賞、開催期間、選考テーマを伝える
        - 領域のデザインのテイスト：
        - 内部にある部品
    - 領域名：Reader Nominee
        - 領域の目的や機能：候補者と公開実績を比較し、一人を選ぶ
        - 領域のデザインのテイスト：人物の物語と実績を同時に見せる
        - 内部にある部品
            - Nominee profile：仮名、実績、推してきた作品を示す
            - Public Contribution Signals：根拠eventへ辿れる候補理由を示す
            - Activity summary：public eventを短く要約する。AI生成時は`AI-generated summary of public activity`と表示し、必ず根拠eventへ辿れるようにする
            - Voter selection：投票対象を一人選ぶ
            - Formal action：`Vote for This Finalist`からWorld proofとWallet署名へ進む

        AI outputは候補資格、投票weight、順位、reward entitlementを決めない。AIが利用不能でも候補比較とformal ballotを続行できる。


### 画面名：Wallet接続・World Proof進行

この画面ですること：
    Readerがformal ballotとRoom capabilityを自分のHedera accountへ結びつける。
    WalletはPoCではHashPack一択とする。この画面は専用にあるというよりもWallet接続や人間証明がVoteやNominateの署名に必要なときに必要に応じて呼び出される画面。初回ballotに必要なProof of Humanを取得し、World anchor finalityと公開検証の進行をReaderへ伝える。

- 領域名：Wallet選択
    - 領域の目的や機能：HashPackと接続中accountを示す。Wallet接続が必要なタイミングで表示され、Worldによる人間認証やVoteの署名をKickする
    - 領域のデザインのテイスト：静かで明快。自己管理する鍵への信頼感を出す。でもベースはライブ会場
    - 内部にある部品
        - HashPack identity：公式brand assetと`HashPack`を示す
        - Connected account：接続後にHedera account IDとnetworkを確認する
        - Connect action：`Connect HashPack`でWallet側の承認へ進む
        - Browse action：署名不要の閲覧へ戻る`Browse Without Connecting`

- 領域名：Proof request
    - 領域の目的や機能：Room固有action、ballot signal、World App handoffを扱う
    - 領域のデザインのテイスト：privacyと進行状況を中心にした静かな画面
    - 内部にある部品
        - Proof of Human説明：`One human. One spot in this Room.`で一人一資格の意味を伝える
        - World App action：`Verify with World ID`でproof requestへ進む
        - Trust summary：`Orb-verified human`、`Unique in this Room`、`Privacy-preserving proof`
        - Privacy details：World ID上のidentityは公開せず、proof、nullifier、Room-bound inputsが公開検証されることを示す

- 領域名：初回ballot status
    - 領域の目的や機能：状態遷移を一つの進行として示す
    - 領域のデザインのテイスト：technical logよりも旅程表示に近いstepper
    - 内部にある部品
        - Proof acquired：World proof取得を示す
        - HCS submitted：Wallet署名済み投稿を示す
        - Message reassembled：logical event完成を示す
        - World finality：anchor block finalityを示す
        - Capability granted：Room capability成立を示す

### 画面名：My Oshikatsu（本棚）

この画面ですること：
    自分の参加Room、推した作品、獲得実績を見返し、推しの近いReaderから次の漫画を見つける。
    これは画面下のNavigationから移動してくる

    - 領域名：仮名profile
        - 領域の目的や機能：Hedera account、表示名、参加実績を示す
        - 領域のデザインのテイスト：推し活手帳。収集物と履歴を整然と並べる
        - 内部にある部品
            - Account identity：仮名accountを示す
            - Badge shelf：`Room Winner`、`Hidden Gem Scout`、`Long-Run Supporter`、`Rooms Joined`を示す
            - My Shelf：登録作品をcover gridで示す
            - Room History：参加RoomとTop 3を示す

    - 領域名：次の推し
        - 領域の目的や機能：推しの近いReaderと、そのReaderが推す漫画を示す
        - 領域のデザインのテイスト：人から本へ辿る推薦棚
        - 内部にある部品
            - Similar Reader：推し傾向の近い仮名profileを示す
            - Recommended work：そのReaderが推した作品を示す
            - 作品へ進む：reading locationまたは次回Roomへ進む

### 画面名：マイページ

この画面ですること：
    - 自分の情報を表示する
    - Roomの作成もここから行う

- 主な英語label
    - 画面名：`Profile`
    - Room作成：`Create a Room`


## UI: Fandom vocabulary and Visual direction

Reader App章を画面、遷移、部品、表示copyの正本とする。この章では各画面の内容を再定義せず、全画面へ共通して適用する判断だけを定める。

### Language

利用者に表示するcopyは英語を正本とし、日本語は設計意図の説明にのみ使う。操作名は結果の違いを曖昧にしない。

- `React`と`Shout`はGrooveへの表現であり、ballotを変更しない。
- `Nominate`はRoom開始前の候補追加にだけ使う。
- `Vote`と`Ballot`はHCSへ記録するformal intentにだけ使う。
- 更新は`Update Ballot`、取消は`Withdraw Ballot`とし、`Delete`や意味のない`Confirm`を使わない。
- `Oshi`と`Groove`はOshikatsu固有語として使う。初見で意味が推測できない場所では、作品、Room、応援の文脈を同時に示す。
- 一般参加者を`Jury`とは呼ばず、`Voter`または`Verified Voter`とする。

ファン語はShout、Reaction、Room演出では積極的に使うが、Wallet署名、World proof、deadline、検証結果では平易で直接的な英語を使う。

### Visual direction

Reader Appは「黒い画面に紫を置く」のではなく、暗転したライブ会場へ漫画の世界が投影され、Readerの反応で光と熱が増していく体験として描く。

- 背景はblackを基調にし、作品cover、会場照明、light stickを視線の起点にする。
- 通常Roomのenergyはelectric violet、hot magenta、cyanで表す。goldはwinner、順位、Special Roomのceremonyに限定する。
- manga coverと人物を最も強い視覚情報とし、説明文や操作panelが作品を覆わないようにする。
- primary actionは大きく一つだけ置く。glowはprimary action、live state、winner revealに限定し、通常のlist、form、protocol detailは静かなoutlineで区別する。
- countdown、人数、ranking、verification stateは画像へ焼き込まず、live dataを表示するUIとして構成する。
- confetti、floating Reaction、light beamは状態変化を伝えるmotion layerとし、本文、操作、coverの顔を覆わない。
- Special Roomは通常Roomと同じ夜の会場を土台にし、laurel、crown、gold lightでceremonyへ変化させる。別productのような配色にはしない。

### Composition

- mobile firstとし、主要なvisual、現在のphase、primary actionが最初のviewportで理解できるようにする。
- bottom navigationの項目と順序はReader Appの定義に従い、画面ごとに変更しない。
- 固定action barとbottom navigationが本文、最後のcard、入力欄を隠さないsafe areaを確保する。
- desktopではmobile画面を拡大せず、中央にRoomまたは作品、左右にLineup、Groove、ballot statusを配置する。
- listとcomparisonは一定のcover ratioとrow heightを保ち、titleやcountの長さでlayoutを動かさない。

### State expression

- presence countと`Verified Voter`数を同じ数字として扱わない。
- HCSへの送信完了は投票成立ではない。`CAPABILITY_GRANTED`になるまでsuccess color、checkmark、confettiを使わない。
- `PENDING`は進行中、`UNVERIFIABLE`は公開証拠の一時不足、`INVALID`は検証不成立として、色、icon、copyを分ける。
- protocol hash、sequence、block情報は隠さず、主画面では要約し、詳細を開いたときに確認できるようにする。
- error画面でもReaderのTop 3や入力済みShoutを保持し、再試行で最初から選び直させない。

### Accessibility and assets

- body textとprotocol statusは高contrastを保ち、small textへmagentaやvioletを使わない。
- Reactionはemojiと英語labelを組み合わせ、screen readerへ同じ意味を渡す。
- motionを止めてもphase、ranking、結果が理解できるようにし、`prefers-reduced-motion`ではswarm、pulse、confettiを停止する。
- title、countdown、count、button、navigationはtextとcomponentで実装し、bitmapへ含めない。
- 背景、cover、avatar、frame、textureは用途ごとに分離し、異なるaspect ratioでも主被写体を失わないfocal pointを持たせる。


# Part III: API Build + Headless PoC Testing

画面定義から、利用者の操作、入力データ、状態変化、生成データ、返却状態を抽出する。Backend APIはこのユースケースを実行し、HederaとWorldへ実際の読み書きと検証を行う。Headless clientはAPIとpublic networkを操作し、JSON、table、logで結果を観測する。

## API Build

### Use CaseとData Contract

- [ ] 画面定義ごとに必要なread modelを定義する
- [ ] 利用者が入力または選択するcommand dataを定義する
- [ ] commandが生成するdomain eventとstate transitionを定義する
- [ ] command resultにSUCCESS、PENDING、INVALID、UNVERIFIABLEを定義する
- [ ] Room、Nominee、Groove、Ballot、World Proof、Capability、Result、Achievementのcanonical schemaを定義する
- [ ] canonical JSON、hash、protocol versionの規則を定義する

### Room lifecycle

- [ ] publication、issue、Nomination Window、opensAt、deadline、ballot rule、reaction vocabulary、achievement policyからRoom manifestを生成する
- [ ] Room固有World actionをmanifestから導出する
- [ ] manifest、event stream、deadline、authorityをpublic artifactとしてcommitする
- [ ] NOMINATION、OPEN、DEADLINE、SEALED、FINALIZEDのphaseをHedera consensus timeから導出する
- [ ] Room一覧、Room詳細、phase、countdown、public artifact referenceを取得できるようにする

### Nomination

- [ ] Readerが一作品をNomineeとして提出する処理を実装する
- [ ] Nominee eventをHedera Walletのpayerへ結びつける
- [ ] logical event completion timestampでNomination Windowを判定する
- [ ] 同一作品の提案をcanonical work identityでgroupingする
- [ ] opensAt時点のcandidate setとcandidate-set hashを導出する
- [ ] Nominee streamとcandidate setを公開データから再構成する

### Groove

- [ ] work、stamp、shout、Hedera accountを束ねたGroove eventを実装する
- [ ] Groove eventをHCSへ書き込む
- [ ] HCS messageをMirror Nodeから取得しlogical eventへ再構成する
- [ ] workごとのGrooveWave、emotion distribution、shout stream、unique human countを導出する
- [ ] Room全体のlive summaryを取得できるようにする

### World Proofと初回Ballot

- [ ] Room manifestからWorld v4 actionTextを導出する
- [ ] action、nonce、createdAt、expiresAtを含むRP request signatureを生成する
- [ ] `proofOfHuman` presetと`allow_legacy_proofs=false`を使うproof request dataを生成する
- [ ] Room、ranking、deadline、Hedera accountからballotHashとWorld signalを生成する
- [ ] World proof、public inputs、anchor block referenceを受け取る
- [ ] canonical WorldIDVerifierでproofをpreflight verificationする
- [ ] anchor blockの鮮度、canonical hash、finalityを追跡する
- [ ] raw World proofを含む初回ballot envelopeを生成する
- [ ] ReaderのNative Wallet署名で初回ballotをHCSへ直接投稿する
- [ ] Mirror Nodeからchunkを完全に再構成する
- [ ] historical World stateでproofを第三者再検証する
- [ ] World nullifierごとの最初のVALID ballotへRoom capabilityを付与する
- [ ] 初回ballotの状態をSUBMITTED、REASSEMBLED、WAITING_WORLD_FINALITY、VALID、INVALID、UNVERIFIABLE、CAPABILITY_GRANTED、NULLIFIER_CONFLICTとして取得できるようにする

### Ballot updateとrevoke

- [ ] capability、Room、ranking、deadline、Hedera accountを束ねたupdate eventを実装する
- [ ] capability、Room、deadline、Hedera accountを束ねたrevoke eventを実装する
- [ ] Native Wallet署名でupdateとrevokeをHCSへ直接投稿する
- [ ] capability ownerとMirror payerの一致を検証する
- [ ] logical event completion timestampで投票Windowを判定する
- [ ] capabilityごとにdeadline以前の最大HCS sequenceをcurrent intentとして導出する
- [ ] current intentと全履歴を取得できるようにする

### ResultとAchievement

- [ ] candidate set、capability、current intent、point ruleからrankingを決定論的に計算する
- [ ] accepted、revoked、invalid、unverifiable、nullifier conflictを集計する
- [ ] manifest deadlineとcutoff sequenceをresultへ含める
- [ ] 同じpublic dataからresult hashを再計算する
- [ ] result commitmentをHederaへ書き込む
- [ ] 🥇、💎、🔥、✏️の対象accountと根拠eventを生成する
- [ ] Achievementのmint、association、claim状態を取得できるようにする

### Public replay

- [ ] manifestと全eventをMirror Nodeから取得する
- [ ] HCS chunkをlogical eventへ再構成する
- [ ] Hedera payer、consensus timestamp、sequenceを検証する
- [ ] World anchorを複数archive providerで照合する
- [ ] historical WorldIDVerifier callを再実行する
- [ ] Room capability、current intent、ranking、Achievement対象を最初から再計算する
- [ ] Backend projectionとpublic replay resultの一致を検証する

## Headless PoC Client

Headless clientは、Backend APIとpublic networkを操作する薄いcommand-line clientとする。Human approvalが必要な操作ではWorld AppとNative Walletへhandoffし、承認結果を待って処理を継続する。

### Command set

- [ ] `room create`：manifest inputからRoomを作成しpublic artifactを表示する
- [ ] `room list`：Room一覧とphaseをtable表示する
- [ ] `room show`：Room manifest、candidate set、deadline、artifact referenceをJSON表示する
- [ ] `room watch`：phase、Groove、verification queue、provisional rankingを継続表示する
- [ ] `nominee add`：work dataを入力しWallet署名済みNominee eventを投稿する
- [ ] `nominee list`：Nominee streamとcandidate-set hashを表示する
- [ ] `groove post`：work、stamp、shoutを入力しGroove eventを投稿する
- [ ] `groove show`：workごとのGrooveWaveを表示する
- [ ] `proof request`：RoomとballotからWorld connector URIとproof request summaryを表示する
- [ ] `ballot submit`：World proofとWallet署名を経て初回ballotを投稿する
- [ ] `ballot status`：初回ballotのverification stateと根拠を表示する
- [ ] `ballot update`：capabilityを使ってrankingを更新する
- [ ] `ballot revoke`：capabilityのcurrent intentをrevokeへ更新する
- [ ] `ballot history`：HCS順の全intentとcurrent intentを表示する
- [ ] `result calculate`：deadline時点のrankingをpublic dataから計算する
- [ ] `result commit`：result hashをHederaへcommitする
- [ ] `achievement plan`：対象accountと根拠eventを表示する
- [ ] `achievement deliver`：Achievement deliveryを実行し状態を表示する
- [ ] `replay room`：Room全体をpublic sourceから再構成し検証reportを出力する

### Output contract

- [ ] 各commandにhuman-readable table outputを用意する
- [ ] 各commandにmachine-readable JSON outputを用意する
- [ ] transaction ID、topic ID、sequence、consensus timestamp、block hashを表示する
- [ ] PENDING stateに次の観測対象と再確認時刻を表示する
- [ ] INVALID stateに成立しなかった検証条件を表示する
- [ ] UNVERIFIABLE stateに不足しているpublic evidenceを表示する

## Headless PoC Scenarios

### End-to-end

- [ ] Room作成からcandidate-set確定までを実Hedera testnetで通す
- [ ] Nominee追加を複数Hedera accountで通す
- [ ] Groove投稿とMirror replayを通す
- [ ] Orb-backed World ID v4 proof取得を実機で通す
- [ ] raw proofを含む初回ballotをNative WalletからHCSへ投稿する
- [ ] WAITING_WORLD_FINALITYからCAPABILITY_GRANTEDまでを通す
- [ ] update、revoke、再updateを投稿し最大pre-deadline sequenceを確認する
- [ ] deadline時点のresultとAchievement planを生成する
- [ ] 独立replayで同じresult hashを生成する

### Protocol states

- [ ] World anchor finality待ちを確認する
- [ ] HCS chunkの一部だけを取得したREASSEMBLY_PENDINGを確認する
- [ ] 改変したproofによるINVALIDを確認する
- [ ] 改変したballotHashとsignalによるINVALIDを確認する
- [ ] payload accountとMirror payerの不一致によるINVALIDを確認する
- [ ] archive provider間のblock hash不一致によるUNVERIFIABLEを確認する
- [ ] historical state取得停止によるUNVERIFIABLEを確認する
- [ ] 同じnullifierの競合によるNULLIFIER_CONFLICTを確認する
- [ ] deadline直前に開始し完了がdeadline後となるlogical eventを確認する
- [ ] duplicate eventのidempotentなprojectionを確認する
- [ ] result commitment後の再実行で同じresult hashを確認する
- [ ] Achievement association待ちとclaim完了を確認する

### External dependency states

- [ ] Hedera submission成功とMirror indexing待ちを分けて確認する
- [ ] World RPC provider一系統の停止時に別providerでverificationを継続する
- [ ] Mirror provider一系統の停止時に別providerでreplayを継続する
- [ ] World App user rejectionをcommand resultとして確認する
- [ ] Native Wallet user rejectionをcommand resultとして確認する

## Completion Gate

- [ ] 画面定義の主要操作をHeadless commandから実行できる
- [ ] APIがHedera testnetとWorld Chainへ実際の読み書きと検証を行う
- [ ] formal effectをtransaction、consensus、proof、public replayで確認できる
- [ ] 途中状態とprotocol stateをcommandから観測できる
- [ ] projectionを初期化しpublic sourceからRoomを再構築できる
- [ ] 独立replayがBackendと同じresult hashを生成する
- [ ] testnet artifactと検証reportを保存する

# Part IV: UI Design Handoff

API Build + Headless PoC TestingのCompletion Gate通過後、画面定義へ具体的なvisual designとinteraction detailを加える。

- [ ] 各画面のView Dataを確定済みread modelへ対応させる
- [ ] 各actionを確定済みuse caseへ対応させる
- [ ] PENDING、INVALID、UNVERIFIABLEをReader向けの言葉とvisual stateへ変換する
- [ ] Roomの時間、GrooveWave、World Proof進行、Ballot current intentをinteraction prototypeへ落とす
- [ ] desktopとmobileのnavigation、layout、motion、accessibilityを設計する
- [ ] 実装に使う背景、cover、avatar、frame、textureを用途別assetへ分離する
- [ ] 画像へ焼き込まれた日本語、countdown、counts、buttons、bottom navigationをReact componentへ置き換える
- [ ] source assetとderivative assetの対応、crop focal point、license statusをasset manifestへ記録する
- [ ] canonical English screen copyとprotocol status copyをi18n keyへ変換する
- [ ] `React`、`Cheer`、`Vote`がformal effectどおりに使い分けられていることをcopy reviewで確認する
- [ ] 320px mobile、390px mobile、768px tablet、1440px desktopでtext overflowとcontrol overlapがないことを確認する
- [ ] `prefers-reduced-motion`でconfetti、reaction swarm、pulse animationを停止できるようにする
- [ ] emoji Reactionにaccessible name、icon buttonにtooltip、GrooveWaveにtext summaryを用意する
- [ ] `SUBMITTED`ではなく`CAPABILITY_GRANTED`だけが投票成功として表現されることをE2E screenshotで確認する
