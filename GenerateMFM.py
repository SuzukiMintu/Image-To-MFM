import copy

#=================================================
# MFM出力用の変数定義
#=================================================

# メモ：本当はこんなグローバル変数でやるのよくないけど、他のやり方わからないので一旦このまま

# 使用できる色の最大数
max_use_colors = 19

# 背景の色
default_background = (0, 0, 0, 0)

# 使用中の色の配列
use_colors = []
# 現在使用している色のインデックス
use_color_index = -1
# 前回使用していた色のインデックス
pre_use_color_index = -1

# 行ごとに使用する色の配列
mfm_lines_use_colors = []

# mfm出力用の行ごとの配列
mfm_lines = []
# 行ごとの1マス目の色
mfm_lines_first_color = []
# 行ごとの最後に使用していたインデックス
mfm_lines_last_index = []

#=================================================
# MFM出力用の関数定義
#=================================================

### @brief 文字列の先頭を、指定の文字でn文字まで埋める関数
### @param string 対象の文字列
### @param n 目標の文字列長
### @param char 埋める文字列（デフォルトは"0"）
### @return 埋められた文字列
def StringHeadFill(string, n, char = "0"):
    if len(string) < n:
        string = char * (n - len(string)) + string
    return string

### @brief RGBA値を文字列に変換する関数
### @param color 色 (R, G, B, A)
### @param color_type 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
### @return 色コード文字列（例: "ffaaff", "f8f8" など）
def ConvertColorToString(color, color_type):
    r, g, b, a = color
    r = StringHeadFill(format(r, 'x'), 2)
    g = StringHeadFill(format(g, 'x'), 2)
    b = StringHeadFill(format(b, 'x'), 2)
    a = StringHeadFill(format(a, 'x'), 2)

    if color_type == 0:
        # 6桁RGB形式
        return f"{r}{g}{b}"
    
    # ここまで来たらcolor_typeは 1 か 2 しかないはず
    
    # 3桁RGB形式
    r = r[0]
    g = g[0]
    b = b[0]
    
    if color_type == 1:
        return f"{r}{g}{b}"

    elif color_type == 2:
        # 4桁RGBA形式
        a = a[0]
        return f"{r}{g}{b}{a}"
    else:
        print(f"Invalid color type: {color_type}")
        return None

### @brief 現在使用中の色をリセットする関数
def ResetCurrentColors():
    global use_colors, use_color_index, pre_use_color_index
    # 使用中の色をリセット
    use_colors.clear()
    use_color_index = -1
    pre_use_color_index = -1

### @brief 現在使用中の色を指定のインデックスまで閉じる関数
### @param mfm_line 現在のMFM行文字列
### @param close_index どこまでのインデックスを閉じるか
### @return 色を閉じた後のMFM行文字列
def CloseCurrentColors(mfm_line, close_index):
    global use_colors, use_color_index, mfm_lines, mfm_lines_last_index
    
    if not mfm_line:
        # 現在の行が空の場合は何もしない
        return mfm_line

    # 使用中の色がある場合
    if use_colors:
        # 使用中の色の数分 "]" を追加してbg.colorを閉じる
        mfm_line += "]" * ((len(use_colors) - 1) - close_index)
        # 使用中の色を閉じた分だけ削除
        del use_colors[(close_index + 1):]
    
    return mfm_line

### @brief 1行前の色を閉じる関数
### @param close_index どこまでのインデックスを閉じるか
def ClosePreviousColors(close_index):
    global use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index
    
    # 1行前の色がない場合は何もしない
    if not mfm_lines or (mfm_lines_last_index[-1] == -1):
        return
    # 1行前の色を閉じる
    mfm_lines[-1] += "]" * (mfm_lines_last_index[-1] - close_index)

### @brief 1行前の色を指定のインデックスまで現在の行に追加する関数
### @param mfm_line 現在のMFM行文字列
### @param add_index どこまでのインデックスを追加するか
### @return 色を追加した後のMFM行文字列
def AddPreviousColors(mfm_line, add_index):
    global use_colors, mfm_lines, mfm_lines_last_index
    
    # まだ1行前の色がない場合は何もしない
    if (not mfm_lines) or (mfm_lines_last_index[-1] == -1):
        return mfm_line

    # 1行前の行の色を閉じる
    ClosePreviousColors(add_index)
    # 現在の行が空でない場合、閉じた分の色を追加
    if mfm_line:
        for i in range(add_index + 1, mfm_lines_last_index[-1] + 1):
            mfm_line = f"$[bg.color={use_colors[i]} " + mfm_line
    # 1行前の色のインデックスを設定
    mfm_lines_last_index[-1] = add_index

    return mfm_line

### @brief 新しい色を追加する関数
### @param mfm_line 現在のMFM行文字列
### @oaram new_color 新しい色の文字列
### @return 色を追加した後のMFM行文字列
def AddNewColor(new_color):
    global use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index
    # 新しい色を追加
    use_color_index += 1
    use_colors.append(new_color)

### @brief 使用している色の数が上限を超えた場合に今までの色を閉じる関数
### @param mfm_line 現在のMFM行文字列
### @return 色を閉じた後のMFM行文字列
def CloseColorsIfNeeded(mfm_line):
    global max_use_colors, use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index

    # 上限を超えていない場合は何もしない
    if len(use_colors) <= max_use_colors:
        return mfm_line

    if mfm_lines and (mfm_lines_last_index[-1] >= 0):
        #==================================================
        # 1行前の色が残ってる状態で上限を超えた場合
        #==================================================
        
        # 1行前の色を閉じる
        mfm_line = AddPreviousColors(mfm_line, -1)
        # 行を再生成してほしいので使用中の色などをリセット
        ResetCurrentColors()
        mfm_line = None

    else:
        #==================================================
        # 現在の行で上限を超えた場合
        #==================================================

        # 超えた分の色を取得
        over_color = use_colors[max_use_colors]
        # 超えた分を削除
        del use_colors[max_use_colors:]
        # 現時点で使用中の色を閉じる
        mfm_line = CloseCurrentColors(mfm_line, -1)
        # 超えた分の色を追加
        use_colors.append(over_color)
        use_color_index = 0
    
    return mfm_line

### @brief 指定の色が使用中の色に含まれる場合の処理関数
### @param mfm_line 現在のMFM行文字列
### @param color 色の文字列
### @return MFM行文字列
def ColorInUseColors(mfm_line, color):
    global use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index

    # インデックスを取得
    use_color_index = use_colors.index(color)
    # 取得したインデックスが1行前のインデックス以下の場合
    if (mfm_lines) and (use_color_index < mfm_lines_last_index[-1]):
        # 1行前まで使用していた色を閉じて現在の行に追加
        mfm_line = AddPreviousColors(mfm_line, use_color_index)
        # 現在の行も同様に色を閉じる
        mfm_line = CloseCurrentColors(mfm_line, use_color_index)

    # インデックスが前回のインデックスより小さい場合
    if use_color_index < pre_use_color_index:
        # 現在のインデックスまでbg.colorを閉じる
        mfm_line = CloseCurrentColors(mfm_line, use_color_index)

    return mfm_line

### @brief 指定の色が使用中の色に含まれない場合の処理関数
### @param mfm_line 現在のMFM行文字列
### @param color 色の文字列
### @param alpha アルファ値
### @return MFM行文字列
def ColorNotInUseColors(mfm_line, color, alpha):
    global use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index

    # もし不透明でない色の場合
    if alpha != "f":
        # 1行前の色を閉じて現在の行に追加
        if mfm_lines:
            mfm_line = AddPreviousColors(mfm_line, -1)
        # 現在使用中の色を閉じる
        mfm_line = CloseCurrentColors(mfm_line, -1)
        use_color_index = -1

    # 透明の色でなければbg.colorを追加
    if alpha != "0":
        AddNewColor(color)
        # 使用できる色の数を超えた場合の処理
        mfm_line = CloseColorsIfNeeded(mfm_line)
        # mfm_lineがNoneになった場合は再生成なのでreturnする
        if mfm_line is None:
            return None
        # 現在の行に新しい色を追加
        mfm_line += f"$[bg.color={color} "

    return mfm_line

### @brief 背景色を追加する関数
### @param mfm_line 現在のMFM行文字列
### @param color_type 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
### @return MFM行文字列
def AddBackgroundColor(mfm_line, color_type):
    global default_background, use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index
    # 背景色が無効な場合は何もしない
    if (default_background[0] < 0) or (default_background[1] < 0) or (default_background[2] < 0) or (default_background[3] <= 0):
        return mfm_line

    # 背景色を文字列に変換
    bg_color = ConvertColorToString(default_background, color_type)
    # 4桁RGBA形式の場合、アルファ値がf(不透明)ならアルファ値の部分を削る
    if (color_type == 2) and (bg_color[3] == "f"):
        bg_color = bg_color[:3]

    # 背景色が使用中の色にある場合は何もしない
    if bg_color in use_colors:
        return mfm_line

    # 使用中の色が上限を超える場合
    if len(use_colors) >= max_use_colors:
        # 現在使用中の色を閉じて新しく追加
        AddNewColor(bg_color)
        mfm_line = CloseColorsIfNeeded(mfm_line)
        # mfm_lineがNoneになった場合は再生成なのでreturnする
        if mfm_line is None:
            return None
        mfm_line += f"$[bg.color={bg_color} "

    else:
        # 上限を超えない場合は先頭に色を追加
        use_colors = [bg_color] + use_colors
        use_color_index += 1
        mfm_line = f"$[bg.color={bg_color} " + mfm_line
    
    return mfm_line

### @brief 1行分のMFMを生成する関数
### @param color_array_line 色の配列（1行分）
### @param color_type 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
### @param space_char 空白として使用する文字
### @return 生成された1行分のMFM文字列
def GenerateMFMLine(color_array_line, color_type, space_char):
    global use_colors, use_color_index, pre_use_color_index, mfm_lines, mfm_lines_last_index
    mfm_line = ""
    space = ""

    # 背景色を追加
    mfm_line = AddBackgroundColor(mfm_line, color_type)
    
    for rgba in color_array_line:
        # 前まで使用していたインデックスを保存
        pre_use_color_index = use_color_index
        # 色を文字列に変換
        bg_color = ConvertColorToString(rgba, color_type)
        
        # 4桁RGBA形式の場合、アルファ値を取得
        if color_type == 2:
            alpha = bg_color[3]
            # アルファ値がf(不透明)ならアルファ値の部分を削る
            if (alpha == "f"):
                bg_color = bg_color[:3]
        else:
            alpha = "f"
        
        if bg_color not in use_colors:
            #==================================================
            # 使用中の色にない場合の処理
            #==================================================

            mfm_line = ColorNotInUseColors(mfm_line, bg_color, alpha)
            # mfm_lineがNoneになった場合は再生成なのでreturnする
            if mfm_line is None:
                return True  # 再生成が必要なのでTrueを返す

        elif bg_color in use_colors:
            #==================================================
            # 使用中の色にある場合の処理
            #==================================================

            mfm_line = ColorInUseColors(mfm_line, bg_color)
            
        # スペースの追加
        mfm_line += space_char

    # 仮の動作で行ごとに色を閉じる
    if default_background[3] > 0:
        mfm_line = CloseCurrentColors(mfm_line, 0)
        use_color_index = 0
    else:
        mfm_line = CloseCurrentColors(mfm_line, -1)
        use_color_index = -1

    # 使用中の色が無い場合、右端にあるスペースを削除
    if not use_colors:
        mfm_line = mfm_line.rstrip(space_char)

    mfm_lines.append(mfm_line)
    mfm_lines_last_index.append(use_color_index)

    return False  # 成功した場合はFalseを返す

### @brief MFMの文字列生成関数
### @param color_array 色の配列 (辞書型3次元配列)
### @param color_type 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
### @param background_color 背景色 (R, G, B, A)
### @param scale MFMのスケール文字列
### @param space_char 空白として使用する文字
### @param max_overlap_bg_color 重ねがけできるbg.colorの上限
### @return 生成されたMFM文字列
def GenerateMFM(color_array, color_type, background_color, scale, space_char, max_overlap_bg_color):
    global max_use_colors, default_background, mfm_lines, use_colors, use_color_index, pre_use_color_index, mfm_lines_last_index
    print("Generating MFM.")

    max_use_colors = max_overlap_bg_color if max_overlap_bg_color > 0 else 19
    default_background = background_color if background_color else (0, 0, 0, 0)

    i = 0
    for color_line in color_array:
        i += 1
        print(f"\tProcessing line {i}/{len(color_array)}...")
        
        j = 0
        # 各行のMFMを生成。生成に失敗するとTrueを返すので、それで再生成を行う
        while GenerateMFMLine(color_line, color_type, space_char):
            j += 1
            # 10回繰り返しても失敗する場合はエラーとする
            if (j > 10):
                print(f"Failed to generate MFM line. Line {i}")
                break


    # すべての行のMFMを閉じる
    if mfm_lines:
        # 最後の行の色を閉じる
        mfm_lines[-1] = CloseCurrentColors(mfm_lines[-1], -1)

    # MFMの最初にスケールを追加
    mfm_lines[0] = "$[scale.y=" + scale + " " + mfm_lines[0]
    # MFMの最後にスケールを閉じる括弧を追加
    mfm_lines[-1] += "]"

    # MFMの行を結合して最終的な文字列を生成
    mfm_text = "\n".join(mfm_lines)

    print("MFM generation complete.")
    return mfm_text

### @brief MFMをファイルに保存する関数
### @param mfm_text MFMアートの文字列
### @param filename 保存するファイル名（拡張子は自動的に.txtが付与される）
def OutputMFM(mfm_text, filename):
    print(f"Saving MFM art to: {filename}.txt")

    try:
        with open(f"{filename}.txt", "w", encoding="UTF-8") as mfm_file:
            mfm_file.write(mfm_text)
        print(f"MFM art saved to {filename}.txt")
        return True

    except Exception as e:
        print(f"Error saving MFM art: {e}")
        return False