tuzhixz : dialog{
label="图纸写字  --xyp@bsedi.com";
:list_box{
label="常用词库精选";
key="klist";
width=30;
height=10;
fixed_width_font=true;
}
:edit_box{label="图名";key="wordstr";}
:row{
fixed_width=true;
alignment=centered;
:edit_box{label="字高";key="txthh";edit_width=4;}
:popup_list{	//下拉选单1
key="pophh";
edit_width=4;
}
:edit_box{label="角度";key="txtang";edit_width=4;}
:popup_list{	//下拉选单2
key="popang";
edit_width=4;
}
}
spacer_1;
ok_cancel;
}

tzxztsfh:dialog{
	label="图纸写字－特殊符号";
	:row{
		:boxed_radio_column{
			label="符号类型";
			:radio_button{label="一级钢筋 HPB235";key="rb1";}
			:radio_button{label="二级钢筋 HRB335";key="rb2";}
			:radio_button{label="三级钢筋 HRB400";key="rb3";}
			:radio_button{label="四级钢筋";key="rb4";}
			:radio_button{label="5号钢筋";key="rb5";}
			:radio_button{label="RRB400";key="rb6";}
			:radio_button{label="下标";key="rb7";}
			:radio_button{label="上标";key="rb8";}
			:radio_button{label="平方";key="rb9";}
			:radio_button{label="立方";key="rb10";}
			:radio_button{label="给前一个字符画小圈";key="rb11";}
			:radio_button{label="给前二个字符画圈";key="rb12";}
			:radio_button{label="给前一个字符画大圈";key="rb13";}
			}
		:image {
			key = "kimage";
			color = -2;
			width = 30;
			aspect_ratio = 0.66;
			}
		}
		:row{
                        :edit_box{label="文本";key="ktx";}
		        :edit_box{label="字高";key="khh";}
			:edit_box{label="字角";key="kan";}
			}
	spacer_1;
	ok_cancel;
}
