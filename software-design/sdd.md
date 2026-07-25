
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

### Fandom vocabulary

Oshikatsuで使う日本語のファン語と英語UI上の意味を次に固定する。Romajiは日本語を知らないReaderが語を発音し、Vocabularyページや補足表示で原語へ触れるために使う。英語欄は逐語訳ではなく、UI上で意図と操作結果が最も正確に伝わる表現とする。

#### Core vocabulary

| 日本語 | Romaji | 英語 | 解説 |
| --- | --- | --- | --- |
| 推し | oshi | `Oshi` / `Favorite` | 特に応援したい作品または人。Oshikatsu固有概念として`Oshi`を使えるが、初出では対象が分かる文脈を添える。一般的な説明では`favorite`を使う。 |
| 推し活 | oshikatsu | `Oshikatsu` / `supporting your oshi` | 推しを応援し、語り、発見を広げる活動全体。製品名と重なるため、機能名へ機械的に`Oshi Time`とは訳さない。 |
| 推す | osu | 操作に応じて`React`、`Shout`、`Add to My Top 3`、`Vote` | 日本語では応援行為全般を含むが、英語UIではformal effectを明確にするため一語へまとめない。感情、叫び、ranking候補追加、formal ballotをそれぞれ分ける。 |
| スタンプ | sutampu | `Reaction` | 作品への感情をemojiとlabelで送る短い表現。ballotを変更しない。英語UIでは`Stamp`より自然な`Reaction`を使う。 |
| 叫び | sakebi | `Shout` | 読後の熱量を短文で放つ表現。一般的な議論を表す`Comment`とは区別し、ballotを変更しない。 |
| 推薦 | suisen | `Nomination` | Room開始前に作品を候補集合へ提案すること。作品を薦める一般行為と区別する必要がある場所では`Room Nomination`とする。 |
| 候補 | kouho | `Nominee` | Nomination Windowを通過し、Roomで比較または投票される作品・人物。 |
| 投票 | touhyou | `Vote` / `Ballot` | HCSへ記録されるformal intent。操作には`Vote`、記録された内容や状態には`Ballot`を使う。ReactionやShoutをVoteとは呼ばない。 |
| 盛り上がり | moriagari | `Groove` | Room内のReaction、Shout、参加の勢いをまとめたOshikatsu固有のlive energy。単純な投票数ではない。 |
| 共鳴 | kyoumei | `Resonance` | Readerの表現が他のReaderへ届き、反応を生んだ度合い。算出根拠を示せる場合だけ指標名として使う。 |
| 本棚 | hondana | `My Shelf` | Readerが登録した作品と、次に読みたい作品を置くpersonal collection。formal ballotとは独立する。 |
| 実績 | jisseki | `Badges` / `Achievements` | Room参加や応援の履歴から得る記録。画面上の収集物は`Badges`、制度全体は`Achievements`とする。on-chain tokenである場合だけ`NFT`と表示する。 |
| 原石発掘 | genseki hakkutsu | `Hidden Gem Scout` | まだ注目が少ない段階で、後にRoom winnerとなる作品を早く推したReaderの実績。 |
| 継続応援 | keizoku ouen | `Long-Run Supporter` | 複数Roomに継続参加し、作品を応援してきたReaderの実績。 |
| 投票回数 | touhyou kaisuu | `Rooms Joined` / `Ballots Cast` | 何を数えるかで英語を分ける。Room参加数は`Rooms Joined`、成立したformal ballot数は`Ballots Cast`とする。 |

#### Reaction vocabulary

| 日本語 | Romaji | 英語 | 解説 |
| --- | --- | --- | --- |
| 神回 | kamikai | `Peak Chapter` | とびきり完成度が高く、ファンが「今回が最高」と感じたchapter。`Peak fiction`のニュアンスを持つ。 |
| 泣いた | naita | `Cried My Eyes Out` | 強く感情を揺さぶられて泣いたことを表す。 |
| 尊い | toutoi | `Too Precious` | 関係性や存在が愛おしく、守りたいほど価値があるというファン表現。単なる`respect`とは訳さない。 |
| 続き召喚 | tsuzuki shoukan | `Next Chapter Now` | 続きを今すぐ読みたいという強い期待。直訳の`summon the next chapter`よりCTAとして自然な表現を使う。 |
| 優勝 | yuushou | `Chapter of the Week` | 実際の受賞ではなく、Reader個人にとって今回もっとも刺さったというファン表現。formal rankingのwinnerとは区別する。 |
| 無事死亡 | buji shibou | `I'm Dead` | 良すぎる、尊すぎる、衝撃が強すぎるという誇張表現。実際の危害を意味しない。 |
| 溶けた | toketa | `I Melted` | 可愛さ、甘さ、感動で抵抗できなくなった感覚を表す。 |
| 情緒崩壊 | joucho houkai | `Emotionally Wrecked` | 展開によって感情が大きく乱された状態。 |
| 情緒噴火 | joucho funka | `I'm Losing It` | 感情が抑えきれず爆発している状態。`Emotionally Wrecked`より外向きで勢いが強い。 |

VocabularyをUIへ表示する場合も、英語labelを操作の主表示とし、日本語とRomajiはtooltip、用語集、補足sheetで提供する。emojiだけで意味を伝えず、Reactionには必ず英語labelとaccessible nameを持たせる。

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

Part IIをproduct behaviorの正本とし、Part IIIは実装順、外部依存の実証、完了証拠だけを定める。日々の作業状態はGitHub Issue、実ネットワークの結果はrun artifactに置き、この文書へ重複して記録しない。

最初に証明するvertical sliceは次である。

```text
fixed Room manifest
    -> production World ID v4 Proof of Human
    -> HashPack-signed initial ballot on Hedera testnet
    -> Mirror Node chunk reconstruction
    -> finalized historical World verification
    -> Room capability
    -> update / withdraw / re-update
    -> deterministic result
    -> independent public replay with the same result hash
```

このsliceが完了するまで、Grooveの高度な集計、Achievement delivery、AI要約、推薦、複数Room運用、Reader Appのvisual実装は後回しにする。

## Source and implementation policy

- Hedera実装は、Hedera MCPの公式documentationとOpenAPI、workspaceに固定したHedera skill、Context7の順に参照する。
- TypeScriptのHedera SDKは`@hiero-ledger/sdk`を使う。
- 公式sampleを最小の実ネットワークscriptとして動かしてから、Oshikatsuのabstractionへ移す。
- skillのsampleは実装patternとして使うが、network limitとprotocol semanticsは公式documentationを正とする。HCS chunkは1件1,024 bytesを上限とする。
- World IDとWorld Chainも公式documentation、official repository、実production proofの順で確認し、推測したfield mappingを実装しない。

## Stop/go gates

以下はAPI全体を作る前に通す。失敗した場合は下流実装を増やさず、Part Iのprotocolを更新する。

### Gate 0-A: World v4 ballot binding

productionの`proofOfHuman`、`allow_legacy_proofs=false`で次を実証する。

1. 固定Room、固定ranking、固定Hedera accountからsignalを作る。
2. IDKit resultの`signal_hash`が公式`hashSignal(signal)`と一致し、`0x0`ではないことを確認する。
3. Developer Portal verifyとcanonical `WorldIDVerifier.verify`の両方で成功させる。
4. signal、action、nonce、proofを個別に変更し、`INVALID`になることを確認する。

**GO:** custom signalがraw proofへ入り、historical verifier callでballot bindingを再現できる。

**STOP:** custom signalがproofへ入らない、またはPortal以外で必要inputを再構成できない。この場合、現行の「proofがballotを束縛する」設計を変更する。

### Gate 0-B: World v4 Room uniqueness

同じOrb-verified humanについて、同じRP/actionでfresh nonceを使う複数回のproof requestを行う。

| Attempt | Action | Signal | 観測するもの |
| --- | --- | --- | --- |
| A | 同じ | 同じ | baseline nullifier |
| B | 同じ | 同じ | 再発行可否とnullifier |
| C | 同じ | 変更 | 再発行可否とnullifier |
| D | 別Room | 同じ | nullifierがRoom間で分離するか |

**GO:** 同じRoomの2件目が拒否される、または同じhumanをHCS foldで一意に識別できる安定値が得られる。

**STOP:** 同じRoomでfreshかつ独立した利用可能nullifierを複数生成できる。v4 nullifierを「human + RP + actionの安定ID」と仮定せず、sessionまたは別のcapability設計を検討する。

### Gate 0-C: HashPack wallet-signed chunking

HashPack実機でHedera testnetのopen-submit topicへ、1,023、1,024、1,025 bytesと実際のproof envelope相当サイズを投稿する。

**確認事項:** approval回数、全chunkのpayer、transaction ID、`initial_transaction_id`、chunk number/total、sequence、consensus timestamp、途中拒否時の状態。

**GO:** 全chunkを同一accountが署名・支払いし、Mirror Nodeからlogical eventとcompletion timestampを再構成できる。

**STOP:** 一部chunkしか署名できない、partial failureを識別できない、またはproof envelopeが実用上投稿できない。application-level chunking、payload縮小、commitment方式のいずれかへprotocolを変更する。

### Gate 0-D: World historical replay

有効なproduction proofを、選択したWorld blockで`eth_call`し、同じblock hashがfinalizedした後に2系統のarchive RPCから再実行する。

**GO:** block hash、verifier dependency、call resultが一致し、改変proofはrevertする。

**STOP:** historical stateを再取得できない、provider間で一致しない、またはverification-critical stateをpublic artifactから特定できない。

## Architecture boundaries

API、Headless client、Reader Appはprotocolを利用する側とし、public bytesや判定規則を定義しない。

```text
apps/api     apps/cli     apps/web
         \          |          /
            application use cases
             /       |        \
 protocol   projection   external adapters
```

| Package | Responsibility |
| --- | --- |
| `@oshikatsu/protocol` | versioned schema、canonical JSON、hash、action、signal、wire type、golden vector |
| `@oshikatsu/domain` | Room phase、event validation、capability policy、latest intent、ranking、reason code |
| `@oshikatsu/hedera` | topic作成、1,024-byte chunk、transaction構築、operatorまたはwallet submission |
| `@oshikatsu/mirror` | REST pagination、raw schema validation、sequence gap、chunk再構成、payerとcompletion metadata |
| `@oshikatsu/world-id` | manifest由来action、RP signature、IDKit request DTO、raw v4 result parse |
| `@oshikatsu/world-chain` | multi-RPC block照合、historical `eth_call`、finality、proxy/dependency snapshot |
| `@oshikatsu/projection` | public sourceからdecode、verify、fold、result/replay report生成 |
| `@oshikatsu/wallet-handoff` | HashPackとWorld Appのbrowser handoff。秘密鍵を扱わない |
| `apps/cli` | use caseを起動し、人間向けtableとmachine-readable JSONを返す |

protocol packageへHedera SDK、World SDK、Express、React、Firestoreの型を持ち込まない。projectionは同じpure foldを使ってよいが、CLI replayはAPIが保存した結果を信頼せず、public sourceから入力を取得する。

## Milestones

各milestoneは0.5〜2日程度のIssueへ分割し、同時に着手するmilestoneを1つに制限する。完了はcode量ではなくacceptance evidenceで決める。

### M0: Feasibility gates

- Gate 0-Aから0-Dを実行する。
- World action、signal、nullifier、anchor、wallet chunkingについて`GO`、`GO WITH CONSTRAINT`、`STOP`、`BLOCKED`を記録する。
- `STOP`が1件でもあれば下流実装を始めず、protocol decisionを更新する。

**Evidence:** sanitized IDKit result、RP context、World call input/result、Hedera transaction IDs、raw Mirror responses、decision report。

### M1: Protocol kernel and CLI skeleton

- canonical schemaとdomain-separated hashをversion 1として固定する。
- bigint、Hedera consensus timestamp、hashはJavaScript numberにせずstring/bytesで扱う。
- official RP signature/hash test vectorとOshikatsu golden vectorをtest fixtureにする。
- `apps/cli`に`doctor`、`fixture verify`、`world spike`を用意する。

**Gate:** 異なるprocessから同じfixtureを処理して、manifest hash、ballot hash、signal hashがbyte-for-byte一致する。

### M2: Hedera testnet transport

- 公式HCS sampleからopen-submit topic作成とmessage submitを通す。
- Mirror RESTをsequence昇順でpaginateし、raw chunkを取得する。
- `chunk_info.initial_transaction_id`、payer、number、totalを検証してlogical eventを再構成する。
- missing、duplicate、conflicting、interleaved chunk fixtureを拒否する。

**Gate:** 新しいprocessがAPI memoryを使わず、Mirror Nodeだけから同じmanifest bytes、payer、completion sequence/timestampを再構成する。

### M3: Browser approval handoff

- Headless CLIがshort-lived handoffを作り、browser URLまたはQRを表示する。
- browserでHashPack Topic SubmitとWorld App requestを行い、CLIが公開statusをpollして再開する。
- rejection、timeout、disconnect、partial submissionをterminal stateとして返す。

**Gate:** HashPack実機でwallet-signed payloadをHedera testnetへ投稿し、connected accountとMirror payerが一致する。

### M4: World production verification

- backendでmanifestからactionを導出し、RP signing keyで300秒TTLのrequestを作る。
- v4 raw resultを改変せずartifactへ保存し、normalized verifier inputを別に導出する。
- preflight blockはOshikatsu側で選び、block number/hash/timestampを保存する。
- 2 archive RPCでhistorical verificationとfinalityを追跡する。

**Gate:** valid proof、tampered proof、provider unavailableをそれぞれ`VALID`、`INVALID`、`UNVERIFIABLE`へ分類できる。

### M5: Initial ballot capability slice

- fixed candidate setでinitial ballot envelopeを作る。
- HashPackでraw proof込みmessageを投稿する。
- `SUBMITTED -> REASSEMBLED -> WAITING_WORLD_FINALITY -> VALID -> CAPABILITY_GRANTED`を進める。
- Gate 0-Bで確定したuniqueness semanticsに基づき競合を判定する。

**Gate:** 1つのreal Room、1人のreal human、1つのHashPack accountについて、public evidenceだけで`CAPABILITY_GRANTED`を説明できる。

### M6: Ballot lifecycle and deterministic result

- update、withdraw、再updateをHCSへ投稿する。
- deadline以前に完了した最大completion sequenceをcurrent intentにする。
- deadlineを跨ぐchunk group、wrong payer、duplicate eventを拒否する。
- fixed point ruleでresult hashを計算し、authority SEALへcommitする。

**Gate:** API projectionとfresh CLI replayが同じcurrent intent、ranking、result hashを生成する。

### M7: Cloud Run and durable projection

- Cloud Run APIはattached service accountとADCを使う。
- RP signing keyなどのsecretはSecret Managerから渡し、environment variableで使う場合はversionを固定する。
- Firestoreはrebuild可能なprojection/checkpointに限定し、formal sourceにしない。
- projectionを削除してMirror + World public evidenceから再構築するdrillを行う。

**Gate:** fresh Cloud Run revisionとfresh CLIが同じRoomを再現し、secretがimage、browser bundle、log、artifactへ出ない。

### M8: Product expansion

M0〜M7完了後に、Nomination、Groove、Achievement、Special Room、Part IVのReader App実装を順次追加する。Achievement deliveryはHTS実装が完了するまで`NOT_IMPLEMENTED`を明示し、成功をsimulationしない。

## Headless CLI contract

全commandはhuman-readable tableをdefaultとし、`--json`で同じ意味のmachine-readable outputを返す。

```ts
type CommandResult<T> =
    | { status: "SUCCESS"; data: T; evidence: EvidenceRef[] }
    | { status: "PENDING"; data?: T; nextCheckAt?: string; waitingFor: string[] }
    | { status: "INVALID"; reasons: ReasonCode[]; evidence: EvidenceRef[] }
    | { status: "UNVERIFIABLE"; missing: EvidenceRequirement[]; retryable: boolean };
```

command outputには、該当する場合にtransaction ID、topic ID、sequence、consensus timestamp、payer account、World block number/hash、provider observationを含める。secret、完全なcredential、不要なpersonal/device情報は出力しない。

最初に実装するcommandだけを固定する。

```text
doctor
fixture verify
world spike
wallet handoff
ballot submit
ballot status
replay room
```

追加commandは対応milestoneへ到達した時点で増やす。先に全commandのstubを作らない。

## Evidence and context continuity

real-network testは`artifacts/runs/<UTC-run-id>/`へ保存する。private key、RP signing key、access token、不要なWorld identity情報は保存しない。

```text
artifacts/runs/<run-id>/
    run.json            # commit、dependency hash、network、protocol version
    inputs/             # sanitized canonical inputs
    hedera/             # topic、transaction、sequence、Mirror response hash
    world/              # RP/action、anchor、provider observation、call result
    replay/             # accepted/rejected reason、capability、result hash
    report.json         # machine-readable verdict
    next.md             # 次の一つの実行可能action
```

session開始時はactive GitHub Issue、最新runの`next.md`、git status、直前gate commandを読む。session終了時はIssueへ次を残す。

```markdown
### Handoff — YYYY-MM-DD
Commit/worktree: <SHA or dirty files>
Completed: <observable result>
Validation: <commands and result>
Evidence: <run path or links>
Decision: <new constraint or none>
Blocked by: <specific dependency or none>
Next action: <one exact executable step>
```

SDDへ作業statusを書かない。Issueへprotocolの正本を複製しない。再利用可能なrepository固有のpitfallだけをrepository memoryへ記録する。

## GitHub management

- M0〜M8をGitHub milestoneとして管理する。
- Issueは1つのobservable outcome、1つの主要boundary、1つのacceptance procedureに限定する。
- labelsは`spike`、`protocol`、`hedera`、`world-id`、`api`、`cli`、`evidence`、`blocked`、`risk`を使う。
- `Risk register` Issueを1件だけ作り、architectureまたはscheduleを変えるriskのみを記録する。
- GitHub Projectは複数workstreamが同時進行するまで作らない。作る場合もstatus、milestone、risk、ownerだけを持ち、SDDやacceptance criteriaを複製しない。

## PoC completion gate

- Gate 0-A〜0-Dがすべて`GO`または明示された`GO WITH CONSTRAINT`である。
- Orb-backed World ID v4 production proofを実機で取得している。
- raw proofを含むinitial ballotをHashPackからHedera testnetへ直接投稿している。
- Mirror Nodeから全chunk、payer、sequence、completion timestampを再構成している。
- 同じWorld blockでhistorical verifier callをfinality後に再実行している。
- initial ballotがpublic evidenceから`CAPABILITY_GRANTED`へ到達している。
- update、withdraw、再update、deadline跨ぎをreal HCS eventで確認している。
- fresh processによるpublic replayがBackendと同じresult hashを生成している。
- provider停止、World App拒否、HashPack拒否、partial chunk、`INVALID`、`UNVERIFIABLE`を観測している。
- testnet artifactと第三者向けverification reportを保存している。

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
