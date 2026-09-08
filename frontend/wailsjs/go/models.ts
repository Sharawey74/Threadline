export namespace bridge {
	
	export class Workspace {
	    careerRoot: string;
	    planFile: string;
	    hasPlan: boolean;
	    problem: string;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.careerRoot = source["careerRoot"];
	        this.planFile = source["planFile"];
	        this.hasPlan = source["hasPlan"];
	        this.problem = source["problem"];
	    }
	}

}

export namespace plan {
	
	export class Check {
	    label: string;
	    got: number;
	    want: number;
	    unit: string;
	    passed: boolean;
	    detail: string;
	
	    static createFrom(source: any = {}) {
	        return new Check(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.got = source["got"];
	        this.want = source["want"];
	        this.unit = source["unit"];
	        this.passed = source["passed"];
	        this.detail = source["detail"];
	    }
	}
	export class Item {
	    anchor: string;
	    lineNo: number;
	    checked: boolean;
	    text: string;
	    section: string;
	    role: string;
	    order: number;
	    hours: number;
	    hoursConf: string;
	    pages: number;
	    pagesConf: string;
	    notes: string[];
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.anchor = source["anchor"];
	        this.lineNo = source["lineNo"];
	        this.checked = source["checked"];
	        this.text = source["text"];
	        this.section = source["section"];
	        this.role = source["role"];
	        this.order = source["order"];
	        this.hours = source["hours"];
	        this.hoursConf = source["hoursConf"];
	        this.pages = source["pages"];
	        this.pagesConf = source["pagesConf"];
	        this.notes = source["notes"];
	    }
	}
	export class Section {
	    number: number;
	    title: string;
	    lineNo: number;
	    role: string;
	    budget: number;
	    budgetConf: string;
	
	    static createFrom(source: any = {}) {
	        return new Section(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.title = source["title"];
	        this.lineNo = source["lineNo"];
	        this.role = source["role"];
	        this.budget = source["budget"];
	        this.budgetConf = source["budgetConf"];
	    }
	}
	export class Plan {
	    sections: Section[];
	    items: Item[];
	    budget: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new Plan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sections = this.convertValues(source["sections"], Section);
	        this.items = this.convertValues(source["items"], Item);
	        this.budget = source["budget"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Topic {
	    slug: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new Topic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.slug = source["slug"];
	        this.order = source["order"];
	    }
	}

}

export namespace store {
	
	export class Position {
	    artifactId: number;
	    page?: number;
	    scrollPct?: number;
	
	    static createFrom(source: any = {}) {
	        return new Position(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.artifactId = source["artifactId"];
	        this.page = source["page"];
	        this.scrollPct = source["scrollPct"];
	    }
	}

}

export namespace workspace {
	
	export class Artifact {
	    id: number;
	    path: string;
	    title: string;
	    ext: string;
	    isPlanFile: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Artifact(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.title = source["title"];
	        this.ext = source["ext"];
	        this.isPlanFile = source["isPlanFile"];
	    }
	}
	export class BudgetPeriod {
	    section: string;
	    allocatedHours: number;
	    spentHours?: number;
	    measured: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BudgetPeriod(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.section = source["section"];
	        this.allocatedHours = source["allocatedHours"];
	        this.spentHours = source["spentHours"];
	        this.measured = source["measured"];
	    }
	}
	export class Budget {
	    allocatedHours: number;
	    spentHours?: number;
	    periods: BudgetPeriod[];
	
	    static createFrom(source: any = {}) {
	        return new Budget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allocatedHours = source["allocatedHours"];
	        this.spentHours = source["spentHours"];
	        this.periods = this.convertValues(source["periods"], BudgetPeriod);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Content {
	    artifactId: number;
	    kind: string;
	    body: string;
	
	    static createFrom(source: any = {}) {
	        return new Content(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.artifactId = source["artifactId"];
	        this.kind = source["kind"];
	        this.body = source["body"];
	    }
	}

}

