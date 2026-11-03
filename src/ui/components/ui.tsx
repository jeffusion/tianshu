import * as Select from '@radix-ui/react-select';
import * as Accordion from '@radix-ui/react-accordion';
import * as Tooltip from '@radix-ui/react-tooltip';
import {Check,ChevronDown} from 'lucide-react';
import type {ButtonHTMLAttributes,ReactNode} from 'react';

export function Button({className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button type="button" className={`button ${className}`} {...props}/>;}
export function IconButton({label,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;children:ReactNode}){
  return <Tooltip.Root><Tooltip.Trigger asChild><Button className="icon-button" aria-label={label} {...props}>{children}</Button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={8}>{label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}
export const filters=[{value:'all',label:'全部状态'},{value:'attention',label:'待处理'},{value:'active',label:'执行中'},{value:'done',label:'已结束'}] as const;
export type Filter=typeof filters[number]['value'];
export function StatusSelect({value,onChange}:{value:Filter;onChange:(value:Filter)=>void}){
  return <FilterSelect label="筛选任务状态" value={value} onChange={v=>onChange(v as Filter)} options={filters}/>;
}
export function FilterSelect({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:readonly {value:string;label:string}[]}){
  return <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger className="select-trigger" aria-label={label}><Select.Value/><Select.Icon><ChevronDown size={16}/></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="select-content" position="popper" align="end" sideOffset={8} collisionPadding={12}>
      <Select.Viewport>{options.map(item=><Select.Item className="select-item" key={item.value} value={item.value}><Select.ItemText>{item.label}</Select.ItemText><Select.ItemIndicator className="select-indicator"><Check size={16}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
export function Disclosure({value,title,children}:{value:string;title:string;children:ReactNode}){
  return <Accordion.Item className="accordion-item" value={value}><Accordion.Header><Accordion.Trigger className="accordion-trigger">{title}<ChevronDown size={16}/></Accordion.Trigger></Accordion.Header><Accordion.Content className="accordion-content"><div>{children}</div></Accordion.Content></Accordion.Item>;
}
export {Accordion,Tooltip};
