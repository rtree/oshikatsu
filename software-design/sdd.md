
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

### 画面名：Oshikatsu入口

この画面ですること：
次のRoomが開く時間と参加できる漫画の気配を伝え、読者を共有時間へ招く。

領域名：Roomの入口

- 領域の目的や機能：Roomのタイトル、現在のphase（開催時刻までのカウントダウンなど）を示す
- 領域のデザインのテイスト：新刊発売日の高揚感。漫画のビジュアルを主役にした大胆な構成
- 内部にある部品
   - Roomタイトル：今週参加する共有時間を識別する
   - 開催時刻：Roomの開始とdeadlineを示す
   - 作品プレビュー：参加作品の表紙を見せる
   - 参加ボタン：Wallet接続へ進む意思を作る

領域名：今週の熱

- 領域の目的や機能：参加者数、Grooveの勢い、注目作品を短く伝える
- 領域のデザインのテイスト：ライブ会場の開演前。数字は大きく、情報量は絞る
- 内部にある部品
   - Verified Human数：Roomに集まっている人間の規模を示す
   - Grooveインジケータ：現在の盛り上がりを示す

### 画面名：Wallet接続

この画面ですること：
Readerがformal ballotとRoom capabilityを自分のHedera accountへ結びつける。

領域名：Wallet選択

- 領域の目的や機能：接続可能なNative Walletと接続中accountを示す
- 領域のデザインのテイスト：静かで明快。自己管理する鍵への信頼感を出す
- 内部にある部品
   - Wallet選択肢：利用するWalletを選ぶ
   - 接続account表示：Hedera account IDを確認する
   - 接続アクション：Wallet側の承認へ進む

領域名：署名の意味

- 領域の目的や機能：Readerの鍵が担う意思表示を一文で伝える
- 領域のデザインのテイスト：短い説明とshield iconによる安心感
- 内部にある部品
   - Self Custody表示：鍵の管理主体を示す
   - Formal Ballot表示：Wallet署名が使われる操作を示す

### 画面名：Roomロビー

この画面ですること：
ReaderがRoomの開始、deadline、候補集合を理解し、ライブRoomへ入る。

領域名：Room countdown

- 領域の目的や機能：phaseと残り時間を示す
- 領域のデザインのテイスト：ライブイベントの開演時計。時間を第一視線に置く
- 内部にある部品
   - Phase表示：NOMINATION、OPEN、SEALEDを示す
   - Countdown：次のphaseまでの時間を示す
   - Room入場：ライブRoomへ進む

領域名：Lineup

- 領域の目的や機能：manifestに固定された作品を一覧する
- 領域のデザインのテイスト：週刊誌の目次と書店の新刊台を組み合わせる
- 内部にある部品
   - 表紙stack：候補作品の全体像を伝える
   - Manifest識別子：この候補集合の固定状態を示す

### 画面名：Nominee受付

この画面ですること：
ReaderがNomination Window中に一作品を候補として提案し、候補集合の成長を共有する。

領域名：候補一覧

- 領域の目的や機能：現在集まっているNomineeと提案者の仮名accountを示す
- 領域のデザインのテイスト：推薦棚。表紙を中心に、推薦の連鎖を感じる構成
- 内部にある部品
   - Nominee item：漫画名、話数、表紙、reading locationを示す
   - 推薦者表示：候補追加eventのHedera payerを示す
   - Nomination timestamp：候補がHCS consensusへ到達した時刻を示す

領域名：一作品を推薦

- 領域の目的や機能：Readerが推したい作品の情報を入力し、Nominee eventを作る
- 領域のデザインのテイスト：投稿フォームより推薦カードの作成体験を優先する
- 内部にある部品
   - 漫画情報：title、chapter、cover、reading locationを入力する
   - 推薦プレビュー：Room内での見え方を確認する
   - 推薦アクション：Wallet署名へ渡すNominee intentを作る

### 画面名：ライブRoom

この画面ですること：
複数作品のGrooveを同時に眺め、読みたい作品と推したい作品を選ぶ。

領域名：Room pulse

- 領域の目的や機能：Room全体の参加人数、残り時間、Grooveの勢いを示す
- 領域のデザインのテイスト：ライブ実況。動きと密度を持たせる
- 内部にある部品
   - Verified reader count：参加human数を示す
   - Deadline clock：logical event completionの残り時間を示す
   - Live Groove summary：直近の反応を示す

領域名：作品一覧

- 領域の目的や機能：各作品の最新Grooveと主要emotionを比較する
- 領域のデザインのテイスト：縦に読み進める漫画目次。表紙、作品名、波形を一体化する
- 内部にある部品
   - 作品card：表紙、title、chapterを示す
   - Mini GrooveWave：反応量と時間変化を示す
   - Emotion label：代表的なスタンプを示す
   - 作品選択：作品詳細へ進む

領域名：Top 3入口

- 領域の目的や機能：現在選択しているTop 3の数と投票画面への導線を示す
- 領域のデザインのテイスト：画面下部に安定して見える強いaction bar
- 内部にある部品
   - 選択数：現在のranking候補数を示す
   - 投票アクション：Top 3編集へ進む

### 画面名：作品Groove

この画面ですること：
一作品を読み、他のReaderの反応を感じ、自分のスタンプと叫びをGrooveへ加える。

領域名：作品hero

- 領域の目的や機能：作品、chapter、reading locationを提示する
- 領域のデザインのテイスト：表紙をfull-bleedで扱い、作品世界へ入る
- 内部にある部品
   - Cover：作品を視覚的に識別する
   - Chapter情報：今回の話を識別する
   - 読むアクション：公式reading locationへ進む

領域名：Live GrooveWave

- 領域の目的や機能：時間ごとの反応量、emotion分布、Readerの叫びを示す
- 領域のデザインのテイスト：音楽のwaveformとコメントstreamを組み合わせる
- 内部にある部品
   - Wave chart：Room開始から現在までの熱を示す
   - Emotion distribution：スタンプの分布を示す
   - Shout stream：HCS順にReaderの叫びを示す

領域名：自分の推し

- 領域の目的や機能：スタンプと叫びを選び、Groove eventを作る
- 領域のデザインのテイスト：感情の強さを保つ大きなスタンプと短い入力欄
- 内部にある部品
   - Stamp palette：感情を選ぶ
   - Shout input：短い感想を入力する
   - Groove投稿：work、stamp、shout、accountを束ねたintentを作る
   - Top 3追加：この作品をranking候補へ加える

### 画面名：Top 3 Ballot

この画面ですること：
三作品を順位付けし、初回投票または投票更新の意思を確定する。

領域名：Ranking editor

- 領域の目的や機能：三作品の順序と3/2/1 point ruleを示す
- 領域のデザインのテイスト：投票用紙の明快さと漫画表紙の強さを両立する
- 内部にある部品
   - Ranked work：順位、表紙、title、chapterを示す
   - Reorder control：作品順位を変更する
   - Point guide：各順位のpointを示す

領域名：Formal intent

- 領域の目的や機能：初回ballot、update、revokeのうち現在のactionを示す
- 領域のデザインのテイスト：署名直前の静かな確認領域
- 内部にある部品
   - Action type：初回、更新、取消を示す
   - Wallet account：payerとなるaccountを示す
   - Deadline：logical event completionの期限を示す
   - 確定アクション：World proofまたはWallet署名へintentを渡す

### 画面名：World Proof進行

この画面ですること：
初回ballotに必要なProof of Humanを取得し、World anchor finalityと公開検証の進行をReaderへ伝える。

領域名：Proof request

- 領域の目的や機能：Room固有action、ballot signal、World App handoffを扱う
- 領域のデザインのテイスト：privacyと進行状況を中心にした静かな画面
- 内部にある部品
   - Proof of Human説明：一人一資格の意味を伝える
   - World Appアクション：proof requestへ進む
   - Privacy summary：公開されるproof fieldの範囲を示す

領域名：初回ballot status

- 領域の目的や機能：状態遷移を一つの進行として示す
- 領域のデザインのテイスト：technical logよりも旅程表示に近いstepper
- 内部にある部品
   - Proof acquired：World proof取得を示す
   - HCS submitted：Wallet署名済み投稿を示す
   - Message reassembled：logical event完成を示す
   - World finality：anchor block finalityを示す
   - Capability granted：Room capability成立を示す

### 画面名：Ballot記録確認

この画面ですること：
Readerへ現在の正式状態、HCS位置、World検証状態を返し、Roomへ復帰させる。

領域名：記録結果

- 領域の目的や機能：CAPABILITY_GRANTED、BALLOT_UPDATED、BALLOT_REVOKEDの結果を示す
- 領域のデザインのテイスト：達成感と検証可能性を同じ強さで見せる
- 内部にある部品
   - Result title：成立したactionを示す
   - Topic / sequence：HCS上の位置を示す
   - Consensus timestamp：logical event completion時刻を示す
   - World anchor：block hashとfinalityを示す
   - Roomへ戻る：ライブRoomへ進む

### 画面名：Room結果

この画面ですること：
deadlineまでの最後の意思を集計したrankingと、そのRoomのGrooveWaveを見返す。

領域名：今週のranking

- 領域の目的や機能：順位、point、有効capability数を示す
- 領域のデザインのテイスト：雑誌の巻頭ランキング。winnerの表紙を大きく扱う
- 内部にある部品
   - Winner feature：一位作品を示す
   - Ranking list：全作品の順位とpointを示す
   - Verification summary：cutoff、accepted ballot数、manifest hashを示す

領域名：Room replay

- 領域の目的や機能：GrooveWave、主要emotion、転換点を時間順に振り返る
- 領域のデザインのテイスト：ライブのafter movieのような余韻
- 内部にある部品
   - Timeline：Room開始からdeadlineまでの熱を示す
   - Turning points：反応とrankingが動いた瞬間を示す
   - 次の推し：Reader profileと実績を通じて新しい作品へ進む

### 画面名：My Oshikatsu

この画面ですること：
自分の参加Room、推した作品、獲得実績を見返し、推しの近いReaderから次の漫画を見つける。

領域名：仮名profile

- 領域の目的や機能：Hedera account、表示名、参加実績を示す
- 領域のデザインのテイスト：推し活手帳。収集物と履歴を整然と並べる
- 内部にある部品
   - Account identity：仮名accountを示す
   - Achievement shelf：🥇、💎、🔥、✏️の実績を示す
   - Participation history：参加Roomと推した作品を示す

領域名：次の推し

- 領域の目的や機能：推しの近いReaderと、そのReaderが推す漫画を示す
- 領域のデザインのテイスト：人から本へ辿る推薦棚
- 内部にある部品
   - Similar Reader：推し傾向の近い仮名profileを示す
   - Recommended work：そのReaderが推した作品を示す
   - 作品へ進む：reading locationまたは次回Roomへ進む

### 画面名：Special Room

この画面ですること：
漫画文化へ貢献したReaderを候補として見て、人への推しをformal ballotとして表す。

領域名：Special Room hero

- 領域の目的や機能：賞、開催期間、選考テーマを伝える
- 領域のデザインのテイスト：年数回の祝祭。通常Roomより ceremonialな表現
- 内部にある部品
   - Prize title：今回の特別Roomを識別する
   - Evidence period：候補実績の対象期間を示す
   - Jury deadline：投票期限を示す

領域名：Reader Nominee

- 領域の目的や機能：候補者と公開実績を比較し、一人を選ぶ
- 領域のデザインのテイスト：人物の物語と実績を同時に見せる
- 内部にある部品
   - Nominee profile：仮名、実績、推してきた作品を示す
   - Evidence summary：候補理由を示す
   - Jury selection：投票対象を選ぶ
   - Formal action：World proofとWallet署名へ進む

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
