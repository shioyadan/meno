type FinishCallback = (fileContext: FileContext, fileNode: FileNode|null) => void;
type ProgressCallback = (fileContext: FileContext, s: string) => void;
type ReadLineHandler = (line: string) => void;
type CloseHandler = () => void;

const rawStr = 
`1	0	/home/shioya	1	1	0
2	1	.133.11.58.5_1700.txt	0	1	15
3	1	.Synplicity	1	1	4096
4	1	.ICEauthority	0	1	8352
5	1	.Xauthority	0	1	661
6	1	.Xclients	0	1	22
7	1	.adobe	1	1	4096
8	1	.altera.quartus	1	1	4096
9	1	.bash_history	0	1	94627
10	1	.bashrc	0	1	4238
11	1	.bundle	1	1	4096
12	1	.byobu	1	1	4096
13	1	.cache	1	1	4096
14	1	.config	1	1	4096
15	1	.cadence	1	1	4096
16	1	.ccache	1	1	4096
17	1	.conda	1	1	4096
18	1	.cups	1	1	4096
19	1	.docker	1	1	4096
20	1	.emscripten	0	1	2024
21	1	.emacs.d	1	1	4096
22	1	.emscripten_sanity	0	1	58
23	1	.gconf	1	1	4096
24	1	.gitconfig	0	1	63
25	1	.gitkraken	1	1	4096
26	1	.gnupg	1	1	4096
27	1	.icons	1	1	4096
28	1	.java	1	1	4096
29	1	.lesshst	0	1	229
30	1	.local	1	1	4096
31	1	.modelsim	0	1	23307
32	1	.modelsim.bak	0	1	23307
33	1	.mono	1	1	4096
34	1	.mozc	1	1	4096
35	1	.mozilla	1	1	4096
36	1	.node_repl_history	0	1	49
37	1	.npm	1	1	20480
38	1	.pam_environment	0	1	310
39	1	.pcsc13	1	1	4096
40	1	.pki	1	1	4096
41	1	.profile	0	1	770
42	1	.python-history	0	1	100
43	1	.python_history	0	1	0
44	1	.selected_editor	0	1	75
45	1	.sh_history	0	1	70
46	1	.snpsinstaller	1	1	4096
47	1	.ssh	1	1	4096
48	1	.stack	1	1	4096
49	1	.sudo_as_admin_successful	0	1	0
50	1	.swp	0	1	12288
51	1	.synbatch_completions	0	1	1789
52	1	.synplify_premier_history	0	1	690
53	1	.themes	1	1	4096
54	1	.vscode-server	1	1	4096
55	1	.viminfo	0	1	21617
56	1	.vnc	1	1	4096
57	1	.vscode	1	1	4096
58	1	.wget-hsts	0	1	218
59	1	.wine	1	1	4096
60	1	.x2go	1	1	4096
61	1	.xinputrc	0	1	131
62	1	.xorgxrdp.10.log	0	1	18514
63	1	.xorgxrdp.10.log.old	0	1	26498
64	1	.xorgxrdp.11.log	0	1	38110
65	1	.xorgxrdp.11.log.old	0	1	21238
66	1	.xorgxrdp.13.log	0	1	23873
67	1	.xsession-errors	0	1	140642
68	1	docs	1	1	4096
69	1	in_shioya.txt	0	1	0
70	1	innovus.cmd1	0	1	964
71	1	innovus.log	0	1	673
72	1	innovus.log1	0	1	2849
73	1	innovus.logv1	0	1	4492
74	1	innovus.logv	0	1	1023
75	1	log.txt	0	1	0
76	1	mate-terminal.desktop	0	1	10732
77	1	opt	1	1	4096
78	1	r4MBZi.dat	0	1	683
79	1	snap	1	1	4096
80	1	work	1	1	4096
81	1	thinclient_drives	1	1	4096
82	1	tmp	1	1	4096
83	1	transcript	0	1	16
84	3	synplify.ini	0	1	22
85	3	synplify_premier.ini	0	1	3128
86	3	synplify_premier_dp.ini	0	1	22
87	3	synplify_pro.ini	0	1	1155
88	7	Acrobat	1	1	4096
89	8	.6PmajNSF8Kl	0	1	16
90	8	qms-bmh1.bmp	0	1	0
91	8	qms-bmh2.bmp	0	1	0
92	8	qms-bmh3.bmp	0	1	0
93	8	quartus2.ini	0	1	173
94	8	quartus2.qreg	0	1	18188
95	8	quartus_web_rules_file.txt	0	1	0
96	11	cache	1	1	4096
97	12	.screenrc	0	1	0
98	12	.ssh-agent	0	1	26
99	12	.tmux.conf	0	1	0
100	12	.welcome-displayed	0	1	0
101	12	backend	0	1	19
102	12	bin	1	1	4096
103	12	color	0	1	38
104	12	color.tmux	0	1	96
105	12	datetime.tmux	0	1	45
106	12	keybindings	0	1	52
107	12	keybindings.tmux	0	1	0
108	12	profile	0	1	49
109	12	profile.tmux	0	1	47
110	12	prompt	0	1	94
111	12	status	0	1	2733
112	12	statusrc	0	1	2536
113	12	windows	0	1	0
114	12	windows.tmux	0	1	0
115	13	electron	1	1	4096
116	13	event-sound-cache.tdb.0a33b276567a4c17b4a08589b1792a2f.x86_64-pc-linux-gnu	0	1	12288
117	13	event-sound-cache.tdb.3f4d6572224d4764be4f63c43ac574ba.x86_64-pc-linux-gnu	0	1	12288
118	13	event-sound-cache.tdb.d8de9293d84e4459b902fb46f23b723e.x86_64-pc-linux-gnu	0	1	16384
119	13	evolution	1	1	4096
120	13	fontconfig	1	1	16384
121	13	gnome-software	1	1	4096
122	13	gstreamer-1.0	1	1	4096
123	13	ibus	1	1	4096
124	13	ibus-table	1	1	4096
125	13	mesa_shader_cache	1	1	4096
126	13	libgweather	1	1	4096
127	13	motd.legal-displayed	0	1	0
128	13	mozilla	1	1	4096
129	13	nvidia	1	1	4096
130	13	org.remmina.Remmina	1	1	4096
131	13	pip	1	1	4096
132	13	remmina	1	1	4096
133	13	thumbnails	1	1	4096
134	13	tracker	1	1	4096
135	13	typescript	1	1	4096
136	13	update-manager-core	1	1	4096
137	13	vscode-cpptools	1	1	4096
138	15	innovus	1	1	4096
139	14	Code	1	1	4096
140	14	Electron	1	1	4096
141	14	GitKraken	1	1	4096
142	14	Trolltech.conf	0	1	4720
143	14	agate	1	1	4096
144	14	caja	1	1	4096
145	14	configstore	1	1	4096
146	14	dconf	1	1	4096
147	14	enchant	1	1	4096
148	14	evolution	1	1	4096
149	14	folder-color	1	1	4096
150	14	freerdp	1	1	4096
151	14	gedit	1	1	4096
152	14	goa-1.0	1	1	4096
153	14	gnome-control-center	1	1	4096
154	14	gnome-initial-setup-done	0	1	3
155	14	gnome-session	1	1	4096
156	14	gsmartcontrol	1	1	4096
157	14	gtk-3.0	1	1	4096
158	14	htop	1	1	4096
159	14	ibus	1	1	4096
160	14	konata	1	1	4096
161	14	menus	1	1	4096
162	14	nautilus	1	1	4096
163	14	plank	1	1	4096
164	14	procps	1	1	4096
165	14	pulse	1	1	4096
166	14	remmina	1	1	4096
167	14	sazanami	1	1	4096
168	14	smplayer	1	1	4096
169	14	terminus	1	1	4096
170	14	tilda	1	1	4096
171	14	update-notifier	1	1	4096
172	14	user-dirs.dirs	0	1	574
173	16	0	1	1	4096
174	16	1	1	1	4096
175	16	3	1	1	4096
176	16	2	1	1	4096
177	16	4	1	1	4096
178	16	5	1	1	4096
179	16	6	1	1	4096
180	16	8	1	1	4096
181	16	7	1	1	4096
182	16	9	1	1	4096
183	16	a	1	1	4096
184	16	b	1	1	4096
185	16	ccache.conf	0	1	16
186	16	c	1	1	4096
187	16	d	1	1	4096
188	16	e	1	1	4096
189	16	tmp	1	1	45056
190	16	f	1	1	4096
191	17	environments.txt	0	1	78
192	19	.buildNodeID	0	1	64
193	18	lpoptions	0	1	0
194	21	auto-save-list	1	1	4096
195	26	private-keys-v1.d	1	1	4096
196	26	pubring.kbx	0	1	32
197	26	trustdb.gpg	0	1	1200
198	25	config	0	1	333
199	25	error-log.txt	0	1	279
200	25	license.dat	0	1	683
201	25	logs	1	1	4096
202	25	perf-timings.json	0	1	2328
203	25	profiles	1	1	4096
204	25	userusageinfo	0	1	306
205	28	fonts	1	1	4096
206	30	bin	1	1	4096
207	30	lib	1	1	4096
208	30	share	1	1	4096
209	33	registry	1	1	4096
210	34	.encrypt_key.db	0	1	32
211	34	.history.db	0	1	400
212	34	.registry.db	0	1	92
213	34	.renderer.:1.ipc	0	1	56
214	34	.renderer.:10.0.ipc	0	1	57
215	34	.server.lock	0	1	0
216	34	.session.ipc	0	1	56
217	34	boundary.db	0	1	80012
218	34	cform.db	0	1	2060
219	34	segment.db	0	1	320012
220	35	extensions	1	1	4096
221	35	firefox	1	1	4096
222	35	systemextensionsdev	1	1	4096
223	39	pcscd.comm	0	1	0
224	37	@electron	1	1	4096
225	37	@sindresorhus	1	1	4096
226	37	@szmarczak	1	1	4096
227	37	@nuxt	1	1	4096
228	37	@types	1	1	4096
229	37	_cacache	1	1	4096
230	37	_locks	1	1	4096
231	37	_update-notifier-last-checked	0	1	0
232	37	abbrev	1	1	4096
233	37	acorn	1	1	4096
234	37	acorn-dynamic-import	1	1	4096
235	37	ajv	1	1	4096
236	37	anonymous-cli-metrics.json	0	1	172
237	37	ajv-keywords	1	1	4096
238	37	ansi-regex	1	1	4096
239	37	ansi-styles	1	1	4096
240	37	anymatch	1	1	4096
241	37	arr-diff	1	1	4096
242	37	arr-flatten	1	1	4096
243	37	arr-union	1	1	4096
244	37	array-find-index	1	1	4096
245	37	array-unique	1	1	4096
246	37	asap	1	1	4096
247	37	asar	1	1	4096
248	37	assert-plus	1	1	4096
249	37	asn1	1	1	4096
250	37	assign-symbols	1	1	4096
251	37	asynckit	1	1	4096
252	37	async-each	1	1	4096
253	37	atob	1	1	4096
254	37	author-regex	1	1	4096
255	37	aws-sign2	1	1	4096
256	37	aws4	1	1	4096
257	37	balanced-match	1	1	4096
258	37	base	1	1	4096
259	37	bcrypt-pbkdf	1	1	4096
260	37	base64-js	1	1	4096
261	37	big.js	1	1	4096
262	37	binary-extensions	1	1	4096
263	37	binary	1	1	4096
264	37	bluebird	1	1	4096
265	37	boolean	1	1	4096
266	37	bootstrap	1	1	4096
267	37	bootstrap-vue	1	1	4096
268	37	brace-expansion	1	1	4096
269	37	braces	1	1	4096
270	37	buffer-alloc	1	1	4096
271	37	buffer-alloc-unsafe	1	1	4096
272	37	buffer-crc32	1	1	4096
273	37	buffer-fill	1	1	4096
274	37	buffer-from	1	1	4096
275	37	buffers	1	1	4096
276	37	cache-base	1	1	4096
277	37	cacheable-request	1	1	4096
278	37	camelcase	1	1	4096
279	37	camelcase-keys	1	1	4096
280	37	caseless	1	1	4096
281	37	chainsaw	1	1	4096
282	37	chalk	1	1	4096
283	37	chokidar	1	1	4096
284	37	chromium-pickle-js	1	1	4096
285	37	class-utils	1	1	4096
286	37	clone-response	1	1	4096
287	37	co	1	1	4096
288	37	collection-visit	1	1	4096
289	37	code-point-at	1	1	4096
290	37	color-convert	1	1	4096
291	37	color-name	1	1	4096
292	37	combined-stream	1	1	4096
293	37	commander	1	1	4096
294	37	component-emitter	1	1	4096
295	37	compare-version	1	1	4096
296	37	concat-map	1	1	4096
297	37	config-chain	1	1	4096
298	37	concat-stream	1	1	4096
299	37	consola	1	1	4096
300	37	copy-descriptor	1	1	4096
`;

class FileReader {
    readLineHandler_: ReadLineHandler|null = null;
    closeHandler_: CloseHandler|null = null;
    
    constructor() {
    }

    onReadLine(readLineHandler: ReadLineHandler) {
        this.readLineHandler_ = readLineHandler;
    }
    onClose(closeHandler: CloseHandler) {
        this.closeHandler_ = closeHandler;
    }
    
    load() {
        const lines = rawStr.trim().split("\n");
        for (let i of lines) {
            this.readLineHandler_?.(i);
        }
        this.closeHandler_?.();
    }
}

class FileNode {

    children: Record<string, FileNode>|null = {};
    parent: FileNode | null = null;
    key = "";  // ノードに対応するファイル名
    size = 0;
    fileCount = 1;
    isDirectory = false;
    id = -1;

    constructor() {
    }
}


class FileContext {
    count = 0;

    finishCallback: FinishCallback|null = null;
    progressCallback: ProgressCallback|null = null;

    searchingFileNum = 0;
    searchingDirNum = 1;
    runningReadDirNum = 0;
    runningLstatNum = 0;
    sleepNum = 0;
    tree: FileNode|null  = null;
    callCount = 0;
    mode = "";

    constructor() {
    }
}

class FileInfo {
    canceled = false;
    nextID_ = 1;
    constructor() {
    }

    get nextID() {
        return this.nextID_;
    }

    // キャンセル
    Cancel() {
        this.canceled = true;
    }

    // tree で渡されてくるツリーにおいて，
    // 各ディレクトリが含む合計サイズを計算して適用する
    finalizeTree_(context: FileContext, tree: FileNode) {
        if (context.count % (1024*4) == 0) {
            context.progressCallback?.(context, tree.key);
        }
        context.count += 1;

        let sizeAndCount = [0,0];
        for(let key in tree.children) {
            let val = tree.children[key];
            if (val.isDirectory && val.children) {
                let child = this.finalizeTree_(context, val);
                val.size = child[0];
                val.fileCount = child[1];
            }
            sizeAndCount[0] += val.size;
            sizeAndCount[1] += val.fileCount;
        }
        return sizeAndCount;
    };

    import(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback) {

        // 各ノードに id をふり，各ノードは自分の親の id をダンプする
        // id=0 は実際には存在しない仮のルートノードとなる
        let idToNodeMap: Record<number, FileNode> = {};
        idToNodeMap[0] = new FileNode();

        let lineNum = 1;
        let context = new FileContext;
        context.mode = "import";
        context.progressCallback = progressCallback;
        
        reader.onReadLine((line: string) => {
            let node = new FileNode();

            // process.stdout.write(`${id}\t${parent}\t${src.key}\t${src.isDirectory?1:0}\t${src.fileCount}\t${src.size}\n`);
            let args = line.split(/\t/);
            if (args.length != 6) {
                console.log(`invalid line: ${line}`);
                return;
            }

            let id = Number(args[0]);
            let parentID = Number(args[1]);

            idToNodeMap[id] = node;
            node.key = args[2];
            node.isDirectory = Number(args[3]) == 1 ? true : false;
            node.fileCount = Number(args[4])
            node.size = Number(args[5]);
            node.children = null;   // 子供がない場合は null に

            // 親 -> 子の接続
            if (parentID in idToNodeMap) {
                let parentNode = idToNodeMap[parentID];
                node.parent = parentNode;
                if (!parentNode.children) {
                    parentNode.children = {};
                }
                parentNode.children[node.key] = node;
            }
            else {
                console.log(`Invalid parent id: ${parentID}`);
            }

            if (lineNum % (1024 * 128) == 0) {
                context.count = lineNum;
                progressCallback(context, node.key);
            }
            lineNum++;
        });

        reader.onClose(() => {
            let root = idToNodeMap[0];
            if (idToNodeMap[0].children) {
                // id=0 は実際には存在しないルートのノードなので，取り除く
                let keys = Object.keys(idToNodeMap[0].children);
                root = idToNodeMap[0].children[keys[0]];
                root.parent = null;
            }

            let context = new FileContext();
            context.progressCallback = progressCallback;
            context.mode = "parsed";
            context.count = 0;
            progressCallback(context, root.key);

            setTimeout(() => {
                let sizeAndCount = this.finalizeTree_(context, root);
                root.size = sizeAndCount[0];
                root.fileCount = sizeAndCount[1];
    
                context.mode = "finalize";
                context.count = root.fileCount;
                progressCallback(context, root.key);
                finishCallback(context, root);
            }, 0);
        });
    }
};

export { FileReader, FileInfo, FileNode, FileContext };