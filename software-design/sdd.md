
# Product design

> 今週の漫画と来週の一話を、検証可能な読者の熱でつなぐ。

この文書はOshikatsuのプロダクト判断に関する正本である。価値仮説、対象者、体験原則、Room lifecycle、trust boundary、投票protocol、reward、検証方法を一つの設計として扱う。

プロダクトの約束はmanifest、event schema、replay rule、UI copy、テストの組として管理する。約束を変更するときは、この組を同じversionで更新する。

# Part I: Product Design

## P0. North Star: Human Groove Window

> 新しくリリースされた漫画を、短い時間に、人間同士で一緒に楽しむ。

これがOshikatsuの目的である。

いま読んだ人間が同じ限られた時間に驚き、笑い、迷い、推しを変え、その空気を共有する場所を作る。第一目的は、**今日出た漫画を、今日そこにいる人間たちで楽しく読むこと**である。Oshikatsuは「人間が参加している共有時間」を守る。

